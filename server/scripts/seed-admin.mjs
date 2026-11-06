import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashSecret } from '../src/modules/auth/service.js';
import { seedDefaultInventoryItems } from '../src/modules/inventory/service.js';

const WORDS = [
  'Aqua',
  'Blue',
  'Clear',
  'Cool',
  'Drop',
  'Flow',
  'Fresh',
  'Lake',
  'Mist',
  'Pure',
  'Rain',
  'River',
  'Spring',
  'Stream',
  'Tide',
  'Wave',
];

function randomPassword() {
  const w1 = WORDS[crypto.randomInt(0, WORDS.length)];
  const w2 = WORDS[crypto.randomInt(0, WORDS.length)];
  const d1 = String(crypto.randomInt(10, 100));
  const d2 = String(crypto.randomInt(10, 100));
  return `${w1}-${d1}-${w2}-${d2}-${crypto.randomInt(10, 100)}`;
}

function randomPin() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

const TEST_ACCOUNTS = [
  {
    username: 'manager',
    displayName: 'ผู้จัดการโรงงาน (Manager)',
    role: 'manager',
  },
  {
    username: 'staff_office',
    displayName: 'เจ้าหน้าที่สำนักงาน (Staff)',
    role: 'staff',
  },
  {
    username: 'staff_qc',
    displayName: 'เจ้าหน้าที่ควบคุมคุณภาพ/สต็อก (Staff QC)',
    role: 'staff',
  },
  {
    username: 'driver',
    displayName: 'พนักงานขับรถส่งน้ำ (Driver)',
    role: 'driver',
  },
];

function upsertUser(db, { username, displayName, role, password, pin }) {
  const passwordHash = hashSecret(password);
  const pinHash = hashSecret(pin);

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    db.prepare(
      `UPDATE users
       SET display_name = ?, role = ?, password_hash = ?, pin = ?,
           is_active = 1, failed_attempts = 0, lock_until = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(displayName, role, passwordHash, pinHash, existing.id);
    return { id: existing.id, action: 'updated' };
  }

  const res = db
    .prepare(
      `INSERT INTO users (username, display_name, role, password_hash, pin, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
    .run(username, displayName, role, passwordHash, pinHash);

  return { id: Number(res.lastInsertRowid), action: 'created' };
}

export function seedInitialUsers({ adminPassword, adminPin } = {}) {
  const resolvedAdminPass = (adminPassword ?? process.env.ADMIN_INITIAL_PASSWORD ?? '').trim();
  if (!resolvedAdminPass || resolvedAdminPass.length < 8) {
    throw new Error(
      '[FATAL] กรุณาตั้งค่า env ADMIN_INITIAL_PASSWORD (อย่างน้อย 8 ตัวอักษร) ก่อนรัน seed-admin',
    );
  }

  const resolvedAdminPin = (adminPin ?? process.env.ADMIN_INITIAL_PIN ?? '').trim() || randomPin();
  if (!/^\d{4,6}$/.test(resolvedAdminPin)) {
    throw new Error('[FATAL] ADMIN_INITIAL_PIN ต้องเป็นตัวเลข 4–6 หลัก');
  }

  runMigrations();
  const db = getDb();

  const seeded = [];

  const runInTx = db.transaction(() => {
    const adminResult = upsertUser(db, {
      username: 'admin',
      displayName: 'ผู้ดูแลระบบหลัก (Admin)',
      role: 'admin',
      password: resolvedAdminPass,
      pin: resolvedAdminPin,
    });

    seeded.push({
      username: 'admin',
      role: 'admin',
      displayName: 'ผู้ดูแลระบบหลัก (Admin)',
      password: '[จาก env ADMIN_INITIAL_PASSWORD]',
      pin: resolvedAdminPin,
      status: adminResult.action,
    });

    for (const acc of TEST_ACCOUNTS) {
      const password = randomPassword();
      const pin = randomPin();
      const res = upsertUser(db, {
        ...acc,
        password,
        pin,
      });
      seeded.push({
        username: acc.username,
        role: acc.role,
        displayName: acc.displayName,
        password,
        pin,
        status: res.action,
      });
    }

    db.prepare(
      `INSERT INTO audit_logs (user_id, username, role, action, entity, entity_id, ip, status, detail)
       VALUES (?, 'admin', 'admin', 'SEED_USERS', 'users', ?, '127.0.0.1', 'SUCCESS', ?)`,
    ).run(
      adminResult.id,
      String(adminResult.id),
      `สร้าง/อัปเดตบัญชีเริ่มต้น ${seeded.length} บัญชี`,
    );
  });

  runInTx();
  seedDefaultInventoryItems();
  return seeded;
}

export { seedDefaultInventoryItems };

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();

if (isMain) {
  try {
    const seeded = seedInitialUsers();
    const seededInv = seedDefaultInventoryItems();
    console.log('\n====================================================================');
    console.log(' สร้างบัญชีผู้ใช้เริ่มต้นสำเร็จ (แสดงรหัสผ่านและ PIN ครั้งเดียว โปรดจดบันทึก)');
    console.log('====================================================================');
    console.table(
      seeded.map(({ username, role, password, pin, status }) => ({
        username,
        role,
        password,
        pin,
        status,
      })),
    );
    console.log('\n====================================================================');
    console.log(' สต็อกเริ่มต้น 5 SKU หลัก (Inventory Seed)');
    console.log('====================================================================');
    console.table(
      seededInv.map(({ sku, name, stock, min_stock, status }) => ({
        sku,
        name,
        stock,
        min_stock,
        status,
      })),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}
