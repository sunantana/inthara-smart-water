import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// ต้องตั้ง env ก่อน import config.js (config อ่านค่าตอน import)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inthara-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.LOG_LEVEL = 'silent';

afterAll(async () => {
  const { closeDb } = await import('../src/db/connection.js');
  closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
