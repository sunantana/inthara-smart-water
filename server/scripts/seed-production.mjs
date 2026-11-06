import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { hashSecret } from '../src/modules/auth/service.js';
import { seedDefaultInventoryItems } from '../src/modules/inventory/service.js';
import { seedDefaultTmsResources } from '../src/modules/tms/service.js';
import { seedDefaultCmmsResources } from '../src/modules/cmms/service.js';

// 4-letter words + digits to construct exactly 16 characters: 4 + 3 + 1 + 4 + 4 = 16
const WORDS_4 = [
  'Aqua',
  'Blue',
  'Cool',
  'Drop',
  'Flow',
  'Lake',
  'Mist',
  'Pure',
  'Rain',
  'Tide',
  'Wave',
  'Peak',
];

/**
 * สุ่มรหัสผ่าน 16 ตัวอักษรแบบจำง่าย (Memorable 16-character password)
 * รูปแบบ: Word(4) + Num(3) + '-' + Word(4) + Num(4) = 16 ตัวอักษร
 * ตัวอย่าง: "Aqua284-Wave7195"
 */
export function randomMemorablePassword16() {
  const w1 = WORDS_4[crypto.randomInt(0, WORDS_4.length)];
  const d1 = String(crypto.randomInt(100, 1000)); // 3 digits
  const w2 = WORDS_4[crypto.randomInt(0, WORDS_4.length)];
  const d2 = String(crypto.randomInt(1000, 10000)); // 4 digits
  return `${w1}${d1}-${w2}${d2}`;
}

export function randomPin6() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

export const PRODUCTION_ACCOUNTS = [
  {
    username: 'owner_inthara',
    displayName: 'เจ้าของกิจการ / ผู้บริหาร (Owner)',
    role: 'admin',
  },
  {
    username: 'admin_office',
    displayName: 'แอดมินสำนักงาน (Admin Office)',
    role: 'admin',
  },
  {
    username: 'qc_production',
    displayName: 'เจ้าหน้าที่ฝ่ายผลิตและควบคุมคุณภาพ (QC Production)',
    role: 'staff',
  },
  {
    username: 'tech_cmms',
    displayName: 'ช่างเทคนิคและซ่อมบำรุงเครื่องจักร (Tech CMMS)',
    role: 'staff',
  },
  {
    username: 'driver_gps',
    displayName: 'พนักงานขับรถส่งน้ำ (Driver GPS)',
    role: 'driver',
  },
];

export const DEFAULT_PRODUCTION_PRICE_TIERS = [
  {
    id: 1,
    name: 'ราคาปลีก / ลูกค้าทั่วไป (Retail)',
    price_189l_sat: 2000, // 20 บาท
    price_350ml_sat: 3500, // 35 บาท
    price_600ml_sat: 4000, // 40 บาท
    price_1500ml_sat: 4500, // 45 บาท
  },
  {
    id: 2,
    name: 'ราคาส่ง / ร้านค้าประจำ (Wholesale)',
    price_189l_sat: 1500, // 15 บาท
    price_350ml_sat: 3000, // 30 บาท
    price_600ml_sat: 3500, // 35 บาท
    price_1500ml_sat: 4000, // 40 บาท
  },
  {
    id: 3,
    name: 'ราคาองค์กร / สถานศึกษา (Organization)',
    price_189l_sat: 1400, // 14 บาท
    price_350ml_sat: 2800, // 28 บาท
    price_600ml_sat: 3200, // 32 บาท
    price_1500ml_sat: 3800, // 38 บาท
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

export function seedPriceTiers(db) {
  const stmt = db.prepare(`
    INSERT INTO price_tiers (id, name, price_189l_sat, price_350ml_sat, price_600ml_sat, price_1500ml_sat, is_active)
    VALUES (@id, @name, @price_189l_sat, @price_350ml_sat, @price_600ml_sat, @price_1500ml_sat, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      price_189l_sat = excluded.price_189l_sat,
      price_350ml_sat = excluded.price_350ml_sat,
      price_600ml_sat = excluded.price_600ml_sat,
      price_1500ml_sat = excluded.price_1500ml_sat,
      updated_at = datetime('now')
  `);

  for (const tier of DEFAULT_PRODUCTION_PRICE_TIERS) {
    stmt.run(tier);
  }
}

/**
 * รันการ Seed ข้อมูลระดับ Production ครบวงจร
 */
export function seedProduction({ adminPassword } = {}) {
  runMigrations();
  const db = getDb();

  const envAdminPassword = (adminPassword ?? process.env.ADMIN_INITIAL_PASSWORD ?? '').trim();
  const seededAccounts = [];
  const usedPins = new Set();
  const usedPasswords = new Set();

  function getUniquePin() {
    let pin = randomPin6();
    while (usedPins.has(pin)) {
      pin = randomPin6();
    }
    usedPins.add(pin);
    return pin;
  }

  function getUniquePassword() {
    let pass = randomMemorablePassword16();
    while (usedPasswords.has(pass)) {
      pass = randomMemorablePassword16();
    }
    usedPasswords.add(pass);
    return pass;
  }

  const runInTx = db.transaction(() => {
    // 1) Seed 5 Production Users
    for (const acc of PRODUCTION_ACCOUNTS) {
      let password = '';
      if (acc.username === 'owner_inthara' && envAdminPassword.length >= 8) {
        password = envAdminPassword;
      } else {
        password = getUniquePassword();
      }

      const pin = getUniquePin();
      const res = upsertUser(db, {
        username: acc.username,
        displayName: acc.displayName,
        role: acc.role,
        password,
        pin,
      });

      seededAccounts.push({
        id: res.id,
        username: acc.username,
        displayName: acc.displayName,
        role: acc.role,
        password,
        pin,
        status: res.action,
      });
    }

    // 2) Seed Price Tiers ตั้งต้น
    seedPriceTiers(db);

    // 3) Audit Log
    const firstAdmin = seededAccounts.find((a) => a.role === 'admin') || seededAccounts[0];
    db.prepare(
      `INSERT INTO audit_logs (user_id, username, role, action, entity, entity_id, ip, status, detail)
       VALUES (?, ?, 'admin', 'SEED_PRODUCTION', 'system', 'all', '127.0.0.1', 'SUCCESS', ?)`,
    ).run(
      firstAdmin.id,
      firstAdmin.username,
      `สร้าง/อัปเดตข้อมูล Production ตั้งต้น (${seededAccounts.length} บัญชี, Price Tiers, สต็อก, TMS, CMMS)`,
    );
  });

  runInTx();

  // 4) Seed Default Resources: Inventory items, Vehicles/Drivers (TMS), Machines/Parts (CMMS)
  seedDefaultInventoryItems();
  seedDefaultTmsResources();
  seedDefaultCmmsResources();

  return seededAccounts;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase();

if (isMain) {
  try {
    const accounts = seedProduction();
    console.log('\n========================================================================================');
    console.log('   🎉 [INTHARA ERP v2] สคริปต์ SEED PRODUCTION สำเร็จเรียบร้อยแล้ว');
    console.log('   ⚠️  คำเตือน: โปรดจดบันทึกรหัสผ่านและ PIN ด้านล่างนี้ทันที ระบบจะไม่แสดงรหัสผ่านนี้อีก!');
    console.log('========================================================================================\n');

    console.table(
      accounts.map(({ username, displayName, role, password, pin, status }) => ({
        Username: username,
        'Display Name': displayName,
        Role: role,
        Password: password,
        PIN: pin,
        Action: status,
      })),
    );

    console.log('\n✅ ฐานข้อมูลพร้อมใช้งาน:');
    console.log(' - ผู้ใช้งานระบบ 5 บัญชีหลักพร้อมสิทธิ์ RBAC ครบถ้วน');
    console.log(' - Price Tiers 3 กลุ่ม (ปลีก, ส่ง, องค์กร)');
    console.log(' - สต็อกสินค้าตั้งต้น (5 SKU น้ำดื่ม, ถังเปล่า, วัตถุดิบ, บรรจุภัณฑ์)');
    console.log(' - ยานพาหนะและพนักงานขับรถส่งน้ำ (TMS)');
    console.log(' - เครื่องจักรและอะไหล่ซ่อมบำรุง (CMMS)\n');
  } catch (error) {
    console.error('[SEED ERROR]', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}
