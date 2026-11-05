import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

/** @type {import('better-sqlite3').Database | null} */
let db = null;

/** path ของไฟล์ฐานข้อมูล (ใช้ใน log/health) */
export function dbFile() {
  return path.join(config.dataDir, 'inthara.db');
}

/**
 * คืน connection เดียวของ process (better-sqlite3 เป็น synchronous จึงใช้ร่วมกันได้)
 * ตั้งค่า PRAGMA ที่จำเป็นตาม 02 §3 และ 03 (WAL / busy_timeout / foreign_keys)
 */
export function getDb() {
  if (db) return db;

  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new Database(dbFile());

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  return db;
}

/** ปิด connection (ใช้ตอน shutdown และใน test teardown) */
export function closeDb() {
  if (!db) return;
  try {
    db.close();
  } finally {
    db = null;
  }
}

export default { getDb, closeDb, dbFile };
