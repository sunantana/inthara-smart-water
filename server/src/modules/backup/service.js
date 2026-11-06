import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import cron from 'node-cron';
import { config } from '../../config.js';
import { closeDb, dbFile, getDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { AppError } from '../../utils/errors.js';

export const MAX_BACKUPS_RETAINED = 30;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function ensureBackupsDir() {
  const dir = config.backupsDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function generateBackupFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());

  const base = `inthara-${yyyy}${mm}${dd}-${hh}${min}`;
  const dir = ensureBackupsDir();

  let targetName = `${base}.db`;
  if (fs.existsSync(path.join(dir, targetName))) {
    const ss = pad(now.getSeconds());
    targetName = `${base}${ss}.db`;
  }
  let seq = 1;
  while (fs.existsSync(path.join(dir, targetName))) {
    targetName = `${base}-${seq++}.db`;
  }

  return targetName;
}

/**
 * ดำเนินการลบไฟล์สำรองเก่าที่เกินโควตา 30 ฉบับ (BKP-1)
 * กฎความปลอดภัย: ลบเฉพาะไฟล์ที่ขึ้นต้นด้วย inthara- และลงท้ายด้วย .db ใน backupsDir เท่านั้น
 */
export function pruneOldBackups() {
  const dir = ensureBackupsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^inthara-.*\.db$/i.test(f))
    .map((f) => {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      return { filename: f, fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (files.length > MAX_BACKUPS_RETAINED) {
    const toDelete = files.slice(MAX_BACKUPS_RETAINED);
    for (const item of toDelete) {
      try {
        fs.unlinkSync(item.fullPath);
      } catch (err) {
        console.warn(`[BACKUP] ไม่สามารถลบไฟล์สำรองเก่า ${item.filename}:`, err);
      }
    }
  }
}

/**
 * POST /api/backup/run (BKP-1, BKP-2)
 * รันคำสั่ง VACUUM INTO ไฟล์ backups/inthara-YYYYMMDD-HHMM.db
 */
export function runBackup() {
  const dir = ensureBackupsDir();
  const filename = generateBackupFilename();
  const targetPath = path.join(dir, filename);

  const db = getDb();
  // SQLite VACUUM INTO สร้างไฟล์ snapshot ที่สอดคล้อง 100% แบบ atomic
  db.prepare('VACUUM INTO ?').run(targetPath);

  const stat = fs.statSync(targetPath);
  pruneOldBackups();

  return {
    success: true,
    filename,
    filePath: targetPath,
    sizeBytes: stat.size,
    sizeFormatted: formatBytes(stat.size),
    createdAt: stat.mtime.toISOString(),
  };
}

/**
 * GET /api/backup/list (BKP-2)
 */
export function listBackups() {
  const dir = ensureBackupsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^inthara-.*\.db$/i.test(f))
    .map((f) => {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      return {
        filename: f,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        createdAt: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return {
    backups: files.map(({ filename, sizeBytes, sizeFormatted, createdAt }) => ({
      filename,
      sizeBytes,
      sizeFormatted,
      createdAt,
    })),
    total: files.length,
    retentionLimit: MAX_BACKUPS_RETAINED,
  };
}

/**
 * GET /api/backup/status (BKP-2)
 */
export function getBackupStatus() {
  const { backups, total } = listBackups();
  const latest = backups[0] || null;

  return {
    status: 'ok',
    backupsDir: config.backupsDir,
    totalBackups: total,
    retentionLimit: MAX_BACKUPS_RETAINED,
    lastBackupAt: latest?.createdAt ?? null,
    lastBackupFilename: latest?.filename ?? null,
    lastBackupSize: latest?.sizeFormatted ?? null,
    cronSchedule: '0 2 * * * (ทุกวัน เวลา 02:00 น.)',
  };
}

/**
 * POST /api/backup/restore { filename, adminPassword } (BKP-2)
 * กู้คืนฐานข้อมูลโดยคัดลอกไฟล์สำรองทับ data/inthara.db อย่างปลอดภัย
 * 1) ตรวจรหัสผ่าน Admin
 * 2) สำรองฐานข้อมูลปัจจุบันเป็น .pre-restore-<timestamp> ก่อนเสมอ
 * 3) ปิด connection, คัดลอกทับ, เปิด connection ใหม่ และตรวจ integrity_check
 */
export function restoreBackup({ filename, adminPassword, actorUsername }) {
  const cleanFilename = String(filename || '').trim();
  const sanitized = path.basename(cleanFilename);
  if (sanitized !== cleanFilename || !/^inthara-.*\.db$/i.test(sanitized)) {
    throw AppError.badRequest('ชื่อไฟล์สำรองไม่ถูกต้องหรือไม่ปลอดภัย');
  }

  const dir = ensureBackupsDir();
  const backupSourcePath = path.join(dir, sanitized);
  if (!fs.existsSync(backupSourcePath)) {
    throw AppError.notFound(`ไม่พบไฟล์สำรอง "${sanitized}" ในโฟลเดอร์ backups`);
  }

  // ยืนยันรหัสผ่านของผู้ดูแลระบบ (Admin)
  const currentDb = getDb();
  let adminUser = null;
  if (actorUsername) {
    adminUser = currentDb
      .prepare('SELECT * FROM users WHERE username = ? AND role = ?')
      .get(actorUsername, 'admin');
  }
  if (!adminUser) {
    adminUser = currentDb
      .prepare("SELECT * FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1")
      .get();
  }

  if (!adminUser || !adminUser.password_hash) {
    throw AppError.unauthorized('ไม่พบข้อมูลบัญชีผู้ดูแลระบบ (Admin)');
  }

  const isPasswordValid = bcrypt.compareSync(String(adminPassword || ''), adminUser.password_hash);
  if (!isPasswordValid) {
    throw AppError.unauthorized('รหัสผ่าน Admin ไม่ถูกต้อง ไม่อนุญาตให้คืนค่าฐานข้อมูล');
  }

  const targetDbPath = dbFile();
  const targetDir = path.dirname(targetDbPath);

  // สำรองฐานข้อมูลปัจจุบันเป็น pre-restore ก่อนเสมอ
  const preRestoreName = `inthara.db.pre-restore-${Date.now()}`;
  const preRestorePath = path.join(targetDir, preRestoreName);

  if (fs.existsSync(targetDbPath)) {
    fs.copyFileSync(targetDbPath, preRestorePath);
  }

  try {
    // ปิด connection ปัจจุบัน
    closeDb();

    // ลบไฟล์ WAL / SHM เดิมเพื่อป้องกันข้อมูลปะปน
    const walFile = `${targetDbPath}-wal`;
    const shmFile = `${targetDbPath}-shm`;
    if (fs.existsSync(walFile)) {
      try {
        fs.unlinkSync(walFile);
      } catch {}
    }
    if (fs.existsSync(shmFile)) {
      try {
        fs.unlinkSync(shmFile);
      } catch {}
    }

    // คัดลอกไฟล์สำรองมาทับไฟล์ฐานข้อมูลหลัก
    fs.copyFileSync(backupSourcePath, targetDbPath);

    // เปิด connection ใหม่อีกครั้ง
    const restoredDb = getDb();

    // ตรวจสอบความสมบูรณ์ของฐานข้อมูล
    const check = restoredDb.prepare('PRAGMA integrity_check').get();
    const integrityResult = check ? Object.values(check)[0] : '';
    if (integrityResult !== 'ok') {
      throw new Error(`integrity check failed: ${integrityResult}`);
    }

    // รัน migration เผื่อกรณีไฟล์สำรองมี schema เก่ากว่า
    runMigrations();

    return {
      success: true,
      message: `คืนค่าฐานข้อมูลจากไฟล์สำรอง "${sanitized}" สำเร็จเรียบร้อยแล้ว`,
      restoredFrom: sanitized,
      preRestoreBackup: preRestoreName,
      restoredAt: new Date().toISOString(),
    };
  } catch (err) {
    // กู้คืนไฟล์เดิมจาก pre-restore กลับมาถ้าเกิดข้อผิดพลาด
    try {
      closeDb();
      if (fs.existsSync(preRestorePath)) {
        fs.copyFileSync(preRestorePath, targetDbPath);
      }
      getDb();
    } catch {}
    throw new AppError(500, 'INTERNAL', `การคืนค่าฐานข้อมูลล้มเหลว: ${err.message}`);
  }
}

/** @type {cron.ScheduledTask | null} */
let backupCronTask = null;

export function startBackupCron() {
  if (config.isTest) return;
  if (backupCronTask) return;

  // รันทุกวันเวลา 02:00 น. ตามข้อกำหนด BKP-1
  backupCronTask = cron.schedule('0 2 * * *', () => {
    try {
      runBackup();
    } catch (err) {
      console.error('[CRON] เกิดข้อผิดพลาดขณะรันสำรองข้อมูลประจำวัน (02:00 น.):', err);
    }
  });
}

export function stopBackupCron() {
  if (backupCronTask) {
    backupCronTask.stop();
    backupCronTask = null;
  }
}
