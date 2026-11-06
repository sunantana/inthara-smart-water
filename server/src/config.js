import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** server/ (รากของ workspace backend) — ใช้ resolve path ของ data/ และ migrations */
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// โหลด server/.env ถ้ามี — ใช้ API ของ Node เอง (process.loadEnvFile) จึงไม่ต้องพึ่ง dotenv
const envFile = path.join(serverRoot, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

/**
 * อ่าน env ที่เป็นจำนวนเต็ม — ค่าผิดรูปแบบต้องพังตอน start ไม่ใช่ตอนรับ request
 * @param {string} name
 * @param {number} fallback
 * @param {NodeJS.ProcessEnv} [env]
 */
function readInt(name, fallback, env = process.env) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`[FATAL] env ${name} ต้องเป็นจำนวนเต็ม >= 0 (ได้ "${raw}")`);
  }
  return parsed;
}

/**
 * โหลดและตรวจค่า JWT_SECRET ตามโหมดรัน:
 * - production: ต้องมีค่าและยาวอย่างน้อย 32 ตัวอักษร มิฉะนั้นปฏิเสธการ start ทันที
 * - development / test: ถ้าไม่ได้ตั้งค่า จะสุ่ม secret ชั่วคราว (96 hex chars) ต่อการ start 1 ครั้ง พร้อมเตือนใน log 1 ครั้ง
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(msg: string) => void} [warnFn]
 */
export function resolveJwtSecret(env = process.env, warnFn = console.warn) {
  const nodeEnv = (env.NODE_ENV || 'development').trim();
  const isProduction = nodeEnv === 'production';
  const rawSecret = (env.JWT_SECRET || '').trim();

  if (isProduction) {
    if (!rawSecret) {
      throw new Error(
        [
          '',
          '[FATAL] ไม่ได้ตั้งค่า JWT_SECRET — เซิร์ฟเวอร์จะไม่เริ่มทำงานในโหมด production',
          '        วิธีแก้: ตั้ง env JWT_SECRET เป็นสตริงสุ่มอย่างน้อย 32 ตัวอักษร',
          '        สร้างค่า: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
          '',
        ].join('\n'),
      );
    }
    if (rawSecret.length < 32) {
      throw new Error('[FATAL] JWT_SECRET สั้นเกินไป (ต้องอย่างน้อย 32 ตัวอักษร)');
    }
    return rawSecret;
  }

  if (!rawSecret) {
    warnFn('[DEV] ไม่พบ JWT_SECRET — ใช้ secret ชั่วคราว เซสชันจะหมดเมื่อ restart');
    return crypto.randomBytes(48).toString('hex');
  }

  return rawSecret;
}

const nodeEnv = (process.env.NODE_ENV || 'development').trim();
const isProduction = nodeEnv === 'production';
const jwtSecret = resolveJwtSecret(process.env);

export const config = Object.freeze({
  serverRoot,
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: readInt('PORT', 3001),
  /** โฟลเดอร์เก็บ SQLite — ค่าเริ่มต้น server/data */
  dataDir: path.resolve(serverRoot, process.env.DATA_DIR || 'data'),
  logLevel: process.env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info'),
  jwt: Object.freeze({
    secret: jwtSecret,
    /** อายุ access token ตาม 02 §5 */
    accessTtl: '15m',
    /** อายุ refresh token (วัน) ตาม 02 §5 */
    refreshTtlDays: 7,
  }),
});

export default config;
