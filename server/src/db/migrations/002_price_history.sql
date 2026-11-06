-- ==========================================================================
-- 002_price_history.sql — ตารางประวัติการเปลี่ยนราคาลูกค้า (SRS PRC-3) + ดัชนีค้นหา
-- ห้ามแก้ไข 001_init.sql ที่รันแล้ว
-- ==========================================================================

CREATE TABLE customer_price_history (
  id              INTEGER PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  sku             TEXT NOT NULL,            -- FG-189L | FG-350ML | FG-600ML | FG-1500ML
  old_price_sat   INTEGER,
  new_price_sat   INTEGER NOT NULL,
  changed_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_price_history_customer ON customer_price_history(customer_id, created_at DESC, id DESC);
CREATE INDEX idx_customers_type ON customers(customer_type);
