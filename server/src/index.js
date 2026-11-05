import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, dbFile } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './utils/logger.js';

// 1) ฐานข้อมูล + migration ก่อนรับ request
try {
  const applied = runMigrations();
  logger.info(
    { database: dbFile(), appliedMigrations: applied, totalAppliedNow: applied.length },
    'ฐานข้อมูลพร้อมใช้งาน',
  );
} catch (error) {
  logger.error({ err: error }, '[FATAL] เตรียมฐานข้อมูลไม่สำเร็จ');
  process.exit(1);
}

// 2) เปิด HTTP server
const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, `API พร้อมใช้งานที่ http://localhost:${config.port}/api/health`);
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
    closeDb();
    logger.info('ปิดเซิร์ฟเวอร์เรียบร้อย');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection');
});

export { app, server };
