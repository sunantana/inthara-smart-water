-- Inthara Smart Water ERP v2 — Migration 003: เพิ่มค่า 'packaging_consume' ใน stock_movements.reason (Phase 7)
-- รองรับการตัดสต็อกบรรจุภัณฑ์แบบ FIFO ตอนตรวจรับ QA ของล็อตผลิตผ่านเกณฑ์ (INV-2, PRD-3)

CREATE TABLE stock_movements_new (
  id           INTEGER PRIMARY KEY,
  sku          TEXT NOT NULL REFERENCES inventory_items(sku),
  qty_change   INTEGER NOT NULL,
  reason       TEXT NOT NULL CHECK (
                 reason IN (
                   'production_in',
                   'order_out',
                   'checkin_return',
                   'packaging_in',
                   'packaging_consume',
                   'maintenance_use',
                   'adjustment',
                   'backup_restore'
                 )
               ),
  ref_type     TEXT,
  ref_id       TEXT,
  lot_no       TEXT,
  performed_by INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO stock_movements_new (
  id, sku, qty_change, reason, ref_type, ref_id, lot_no, performed_by, created_at
)
SELECT
  id, sku, qty_change, reason, ref_type, ref_id, lot_no, performed_by, created_at
FROM stock_movements;

DROP TABLE stock_movements;

ALTER TABLE stock_movements_new RENAME TO stock_movements;

CREATE INDEX idx_movements_sku ON stock_movements(sku, created_at DESC);
