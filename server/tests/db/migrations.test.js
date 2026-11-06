import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/connection.js';
import { listMigrations, runMigrations } from '../../src/db/migrate.js';

/** ตารางทั้งหมดตาม 03_DB_Schema_SQLite.md + 002_price_history.sql */
const EXPECTED_TABLES = [
  'users',
  'audit_logs',
  'price_tiers',
  'customers',
  'customer_prices',
  'customer_price_history',
  'orders',
  'order_items',
  'checkins',
  'payment_receipts',
  'customer_ledger',
  'inventory_items',
  'stock_movements',
  'production_lots',
  'packaging_lots',
  'employees',
  'assets',
  'vehicles',
  'machines',
  'maintenance_logs',
  'trips',
  'trip_stops',
  'expenses',
  'customer_portal_auth',
];

/** index ที่ตั้งชื่อเองใน 03 + 002_price_history (ไม่นับ sqlite_autoindex ของ UNIQUE) */
const EXPECTED_INDEXES = [
  'idx_audit_created',
  'idx_audit_user',
  'idx_customers_zone',
  'idx_customers_name',
  'idx_customers_active',
  'idx_customers_type',
  'idx_price_history_customer',
  'idx_orders_customer',
  'idx_orders_date',
  'idx_orders_status',
  'idx_order_items_order',
  'idx_checkins_customer',
  'idx_receipts_customer',
  'idx_ledger_customer',
  'idx_movements_sku',
  'idx_prod_date',
  'idx_pack_sku',
  'idx_emp_active',
  'idx_assets_cat',
  'idx_maint_machine',
  'idx_exp_date',
];

const db = getDb();

beforeAll(() => {
  runMigrations();
});

describe('ระบบ migration', () => {
  it('มีไฟล์ migration 001_init.sql, 002_price_history.sql และ 003_packaging_consume_reason.sql เรียงตามลำดับ', () => {
    expect(listMigrations()).toEqual([
      '001_init.sql',
      '002_price_history.sql',
      '003_packaging_consume_reason.sql',
    ]);
  });

  it('รันครั้งแรกแล้วบันทึก schema_version', () => {
    const versions = db.prepare('SELECT version FROM schema_version ORDER BY version').all();
    expect(versions.map((row) => row.version)).toContain('001_init.sql');
    expect(versions.map((row) => row.version)).toContain('002_price_history.sql');
    expect(versions.map((row) => row.version)).toContain('003_packaging_consume_reason.sql');
  });

  it('รันซ้ำแล้วไม่ทำอะไรอีก (idempotent)', () => {
    expect(runMigrations()).toEqual([]);
  });
});

describe('โครงสร้างฐานข้อมูลตาม 03_DB_Schema_SQLite.md + 002_price_history.sql', () => {
  it('มีครบทุกตารางตาม DDL', () => {
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_version'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name);

    expect(tables).toHaveLength(EXPECTED_TABLES.length);
    expect(tables).toEqual([...EXPECTED_TABLES].sort());
  });

  it('มี index ครบทุกตัวตาม DDL', () => {
    const indexes = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name);

    expect(indexes).toHaveLength(EXPECTED_INDEXES.length);
    expect(indexes).toEqual([...EXPECTED_INDEXES].sort());
  });

  it('ตั้ง PRAGMA ตามที่กำหนด (WAL / busy_timeout / foreign_keys)', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5_000);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('ตาราง users ไม่เก็บรหัสผ่านแบบ plaintext', () => {
    const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
    expect(columns).toContain('password_hash');
    expect(columns).not.toContain('passwordPlain');
    expect(columns).not.toContain('password');
  });

  it('คอลัมน์เงินเป็น integer satang ตามข้อตกลง', () => {
    for (const [table, column] of [
      ['orders', 'total_sat'],
      ['orders', 'paid_sat'],
      ['customer_ledger', 'amount_sat'],
      ['payment_receipts', 'amount_sat'],
      ['inventory_items', 'unit_cost_sat'],
      ['customer_price_history', 'new_price_sat'],
    ]) {
      const info = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .find((item) => item.name === column);
      expect(info, `${table}.${column} ต้องมีอยู่`).toBeTruthy();
      expect(info.type).toBe('INTEGER');
    }
  });
});
