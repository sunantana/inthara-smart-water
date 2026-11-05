import { getDb } from '../../db/connection.js';

/**
 * ping ฐานข้อมูลจริงด้วย query (ไม่ใช่แค่เปิดไฟล์)
 * @returns {boolean}
 */
export function ping() {
  const row = getDb().prepare('SELECT 1 AS ok').get();
  return row?.ok === 1;
}

export default { ping };
