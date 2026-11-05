import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './connection.js';

export const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

/**
 * ไฟล์ migration ต้องชื่อ <ลำดับ>_<ชื่อ>.sql และรันตามลำดับตัวเลข
 * ห้ามแก้ไฟล์ที่รันแล้ว — เพิ่มไฟล์ใหม่เท่านั้น (02 §6)
 * @param {string} [dir]
 * @returns {string[]}
 */
export function listMigrations(dir = migrationsDir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * รัน migration ที่ยังไม่เคยรัน แล้วบันทึกในตาราง schema_version
 * ทุกไฟล์รันใน transaction เดียว: สำเร็จทั้งไฟล์หรือไม่เปลี่ยนอะไรเลย
 * @param {{ db?: import('better-sqlite3').Database, dir?: string }} [options]
 * @returns {string[]} ไฟล์ที่รันในรอบนี้
 */
export function runMigrations(options = {}) {
  const db = options.db ?? getDb();
  const dir = options.dir ?? migrationsDir;

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_version').all().map((row) => row.version),
  );
  const insertVersion = db.prepare('INSERT INTO schema_version (version) VALUES (?)');

  const ran = [];
  for (const file of listMigrations(dir)) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      insertVersion.run(file);
    });
    apply();
    ran.push(file);
  }

  return ran;
}

export default { listMigrations, runMigrations, migrationsDir };
