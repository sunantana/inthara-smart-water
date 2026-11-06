import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, dbFile, getDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { startBackupCron, stopBackupCron } from './modules/backup/service.js';
import { seedProduction } from '../scripts/seed-production.mjs';
import { logger } from './utils/logger.js';

// 1) ฐานข้อมูล + migration ก่อนรับ request
try {
  const applied = runMigrations();
  logger.info(
    { database: dbFile(), appliedMigrations: applied, totalAppliedNow: applied.length },
    'ฐานข้อมูลพร้อมใช้งาน',
  );

  // Auto-seed: ถ้าฐานข้อมูลยังไม่มีผู้ใช้ ให้สร้างผู้ใช้และข้อมูลตั้งต้นอัตโนมัติ
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
  if (userCount === 0) {
    logger.info('ฐานข้อมูลยังไม่มีผู้ใช้ — กำลังรัน seed production อัตโนมัติ...');
    seedProduction({ adminPassword: process.env.ADMIN_INITIAL_PASSWORD });
  }
} catch (error) {
  logger.error({ err: error }, '[FATAL] เตรียมฐานข้อมูลไม่สำเร็จ');
  process.exit(1);
}

// 2) เปิด HTTP server
const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, `API พร้อมใช้งานที่ http://localhost:${config.port}/api/health`);
  startBackupCron();
});

// 3) ปิดอย่างสุภาพ: หยุดรับ request ใหม่ → ปิด DB → ออก
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'กำลังปิดเซิร์ฟเวอร์');

  const forceExit = setTimeout(() => {
    logger.error('ปิดไม่สำเร็จภายใน 10 วินาที — บังคับออก');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    stopBackupCron();
    closeDb();
    logger.info('ปิดเซิร์ฟเวอร์เรียบร้อย');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaughtException');
  shutdown('uncaughtException');
});
