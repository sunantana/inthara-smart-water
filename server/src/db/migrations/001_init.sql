-- ==========================================================================
-- 001_init.sql — โครงสร้างฐานข้อมูลตั้งต้น Inthara Smart Water ERP v2
-- ที่มา: docs/specs/03_DB_Schema_SQLite.md (DDL ทั้งไฟล์ ห้ามแก้เองโดยไม่แจ้ง)
-- ข้อตกลง: เงินเป็น integer satang, เวลา ISO UTC string, snake_case
-- ห้ามแก้ไฟล์นี้หลังรันแล้ว — เพิ่มไฟล์ 002_xxx.sql ใหม่แทน
-- ==========================================================================

-- ============ AUTH ============
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','manager','staff','driver')),
  password_hash TEXT NOT NULL,             -- bcrypt/argon2
  pin           TEXT,                      -- hash, ใช้ยืนยันตอน reset รหัสผ่าน
  employee_id   INTEGER REFERENCES employees(id),
  is_active     INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lock_until    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  username   TEXT NOT NULL,
  role       TEXT,
  action     TEXT NOT NULL,               -- LOGIN_SUCCESS, ORDER_CREATE, ...
  entity     TEXT, entity_id TEXT,
  ip         TEXT,
  status     TEXT NOT NULL,               -- SUCCESS/FAILED
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_user    ON audit_logs(user_id, created_at DESC);

-- ============ CRM / PRICING ============
CREATE TABLE price_tiers (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  price_189l_sat   INTEGER NOT NULL,
  price_350ml_sat INTEGER NOT NULL,
  price_600ml_sat INTEGER NOT NULL,
  price_1500ml_sat INTEGER NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE customers (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,             -- CUS-0001
  customer_type TEXT NOT NULL CHECK (customer_type IN ('person','shop','organization')),
  name          TEXT NOT NULL,
  contact_person TEXT, phone TEXT, tax_id TEXT, branch_type TEXT,
  zone          TEXT,
  house_no TEXT, moo TEXT, subdistrict TEXT, district TEXT, province TEXT, postal_code TEXT,
  address       TEXT,                              -- ที่อยู่ประกอบ/สั้น
  lat REAL, lng REAL,
  price_tier_id INTEGER REFERENCES price_tiers(id),
  outstanding_bottles INTEGER NOT NULL DEFAULT 0,  -- ถัง 18.9L ค้างอยู่กับลูกค้า
  balance_sat    INTEGER NOT NULL DEFAULT 0,       -- deposit คงเหลือ (+ = ลูกค้ามีเครดิต/มัดจำ)
  credit_term_days INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_zone  ON customers(zone);
CREATE INDEX idx_customers_name  ON customers(name);
CREATE INDEX idx_customers_active ON customers(is_active);

CREATE TABLE customer_prices (          -- ราคาต่อหน่วยของลูกค้า (override tier)
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sku         TEXT NOT NULL,            -- FG-189L | FG-350ML | FG-600ML | FG-1500ML
  unit_price_sat INTEGER NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (customer_id, sku)
);

-- ============ ORDERS / DELIVERY / BILLING ============
CREATE TABLE orders (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,             -- ORD-YYMMDD-NNN
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','delivered','cancelled')),
  delivery_date TEXT NOT NULL,                    -- YYYY-MM-DD
  total_sat     INTEGER NOT NULL DEFAULT 0,
  paid_sat      INTEGER NOT NULL DEFAULT 0,       -- เงินที่เก็บได้แล้ว
  payment_mode  TEXT,                             -- cash/credit
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff','portal')),
  created_by    INTEGER REFERENCES users(id),
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_date     ON orders(delivery_date DESC);
CREATE INDEX idx_orders_status   ON orders(status, delivery_date);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  unit_price_sat INTEGER NOT NULL,
  delivered_qty INTEGER NOT NULL DEFAULT 0,        -- ยอดจริงตอน check-in
  returned_qty  INTEGER NOT NULL DEFAULT 0         -- ถังคืน (ใช้กับ FG-189L)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE checkins (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER REFERENCES orders(id),
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  trip_id      INTEGER,                             -- FK เพิ่มทีหลัง (trips)
  delivered_json TEXT NOT NULL,                    -- {"FG-189L":10,"FG-350ML":2,...}
  returned_189l   INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('cash','credit')),
  money_received_sat INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_checkins_customer ON checkins(customer_id, created_at DESC);

CREATE TABLE payment_receipts (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,                 -- RCP-YYMMDD-NNN
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_id   INTEGER REFERENCES orders(id),
  checkin_id INTEGER REFERENCES checkins(id),
  amount_sat INTEGER NOT NULL,
  method     TEXT NOT NULL CHECK (method IN ('cash','transfer','deposit','other')),
  printed    INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_receipts_customer ON payment_receipts(customer_id, created_at DESC);

CREATE TABLE customer_ledger (       -- สมุดบัญชีลูกค้า: ทุก movement ที่กระทบยอดเงิน
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('order_debt','payment','deposit_in','deposit_use','deposit_refund','adjustment')),
  amount_sat  INTEGER NOT NULL,                   -- + เพิ่มหนี้/รับเงิน, − ใช้/คืน (ยึด semantic ต่อ type)
  ref_type    TEXT, ref_id TEXT,                  -- order/checkin/receipt
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ledger_customer ON customer_ledger(customer_id, created_at DESC);

-- ============ INVENTORY / PRODUCTION / PACKAGING ============
CREATE TABLE inventory_items (
  sku        TEXT PRIMARY KEY,                     -- FG-189L, FG-350ML, FG-600ML, FG-1500ML, RET-189L-EMPTY, RM-*, SP-*
  name       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('finished_goods','empty_bottle','raw_material','spare_part','packaging')),
  unit       TEXT NOT NULL,
  stock      INTEGER NOT NULL DEFAULT 0,
  min_stock  INTEGER NOT NULL DEFAULT 0,
  unit_cost_sat  INTEGER NOT NULL DEFAULT 0,
  unit_price_sat INTEGER,                         -- NULL = ไม่ขาย
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE stock_movements (       -- audit trail ของทุกการเปลี่ยนสต็อก
  id         INTEGER PRIMARY KEY,
  sku        TEXT NOT NULL REFERENCES inventory_items(sku),
  qty_change INTEGER NOT NULL,                    -- + รับเข้า / − ตัดออก
  reason     TEXT NOT NULL CHECK (reason IN ('production_in','order_out','checkin_return','packaging_in','maintenance_use','adjustment','backup_restore')),
  ref_type   TEXT, ref_id TEXT,
  lot_no     TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_movements_sku ON stock_movements(sku, created_at DESC);

CREATE TABLE production_lots (
  id           INTEGER PRIMARY KEY,
  lot_no       TEXT NOT NULL UNIQUE,              -- LOT-YYMMDD-S-N
  production_date TEXT NOT NULL,
  shift        TEXT NOT NULL CHECK (shift IN ('day','night')),
  plan_json    TEXT NOT NULL,                     -- {"FG-189L":100,...}
  actual_json  TEXT NOT NULL,
  tds_raw REAL, tds_ro REAL, ph REAL,
  qa_passed    INTEGER,                           -- NULL=ยังไม่ตรวจ, 1=ผ่าน, 0=ไม่ผ่าน
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_prod_date ON production_lots(production_date DESC);

CREATE TABLE packaging_lots (
  id           INTEGER PRIMARY KEY,
  lot_no       TEXT NOT NULL UNIQUE,
  purchase_date TEXT NOT NULL,
  sku          TEXT NOT NULL REFERENCES inventory_items(sku),
  quantity     INTEGER NOT NULL,
  remaining_qty INTEGER NOT NULL,
  unit_cost_sat INTEGER NOT NULL,
  supplier     TEXT,
  linked_asset_id INTEGER,                        -- FK assets เพิ่มทีหลัง
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','depleted','void')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pack_sku ON packaging_lots(sku, status);

-- ============ CMMS / ASSETS / EMPLOYEES ============
CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,                -- EMP-001
  name TEXT NOT NULL, nickname TEXT, gender TEXT,
  position TEXT, department TEXT, phone TEXT, id_card TEXT,
  start_date TEXT, salary_type TEXT CHECK (salary_type IN ('monthly','daily','hourly')),
  salary_sat INTEGER,
  driver_license TEXT, driver_license_expiry TEXT,
  username    TEXT,                               -- ผูก users.username
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_emp_active ON employees(is_active);

CREATE TABLE assets (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,               -- AST-xxx
  name        TEXT NOT NULL, category TEXT, category_name TEXT,
  brand TEXT, model TEXT, serial_no TEXT, location TEXT,
  acquisition_date TEXT, cost_sat INTEGER NOT NULL DEFAULT 0,
  useful_life_years INTEGER, salvage_value_sat INTEGER DEFAULT 0,
  depreciation_per_year_sat INTEGER NOT NULL DEFAULT 0,
  accumulated_dep_sat INTEGER NOT NULL DEFAULT 0,
  assigned_employee_id INTEGER REFERENCES employees(id),
  status      TEXT NOT NULL DEFAULT 'in_use' CHECK (status IN ('in_use','maintenance','retired')),
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assets_cat ON assets(category);

CREATE TABLE vehicles (
  id          INTEGER PRIMARY KEY,
  asset_id    INTEGER NOT NULL UNIQUE REFERENCES assets(id),
  plate TEXT NOT NULL, name TEXT, brand TEXT, model TEXT,
  max_bottles_189l INTEGER NOT NULL DEFAULT 0,
  max_packs   INTEGER NOT NULL DEFAULT 0,
  fuel_rate_km_per_liter REAL NOT NULL DEFAULT 0,
  diesel_price_sat_per_liter INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','maintenance')),
  default_driver_id INTEGER REFERENCES employees(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE machines (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL, category TEXT, brand TEXT, model TEXT,
  watts REAL, capacity TEXT,
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','maintenance')),
  run_hours   REAL NOT NULL DEFAULT 0,
  pm_interval_hours REAL,
  last_pm_date TEXT,
  linked_asset_id INTEGER REFERENCES assets(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE maintenance_logs (
  id           INTEGER PRIMARY KEY,
  machine_code TEXT NOT NULL REFERENCES machines(code),
  performed_date TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('repair','pm','inspection')),
  action       TEXT NOT NULL,
  technician   TEXT,
  cost_sat     INTEGER NOT NULL DEFAULT 0,
  spare_sku    TEXT, spare_qty INTEGER,          -- ตัดจาก inventory อะไหล่
  status       TEXT NOT NULL DEFAULT 'done',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_maint_machine ON maintenance_logs(machine_code, performed_date DESC);

-- ============ TMS / EXPENSES ============
CREATE TABLE trips (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,               -- TRP-YYMMDD-NN
  trip_date   TEXT NOT NULL, departed_time TEXT,
  vehicle_id  INTEGER REFERENCES vehicles(id),
  driver_id   INTEGER REFERENCES employees(id),
  stops_count INTEGER NOT NULL DEFAULT 0,
  total_distance_km REAL NOT NULL DEFAULT 0,
  estimated_time_min INTEGER NOT NULL DEFAULT 0,
  total_189l INTEGER NOT NULL DEFAULT 0,
  total_packs INTEGER NOT NULL DEFAULT 0,
  estimated_fuel_cost_sat INTEGER NOT NULL DEFAULT 0,
  total_revenue_sat INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE trip_stops (
  id          INTEGER PRIMARY KEY,
  trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  seq         INTEGER NOT NULL,                   -- ลำดับป้าย
  distance_from_prev_km REAL,
  planned_json TEXT,                              -- จำนวนที่วางแผนส่งต่อป้าย
  UNIQUE (trip_id, seq)
);

CREATE TABLE expenses (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('fuel','repair','utility','packaging','salary','other')),
  ref_type   TEXT, ref_id TEXT,                   -- trip/asset/machine/production_lot
  description TEXT,
  amount_sat INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_exp_date ON expenses(date DESC);

-- ============ CUSTOMER PORTAL ============
CREATE TABLE customer_portal_auth (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
  pin_hash    TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  lock_until  TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
