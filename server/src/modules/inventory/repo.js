import { getDb } from '../../db/connection.js';

export const DEFAULT_INVENTORY_ITEMS = [
  {
    sku: 'FG-189L',
    name: 'น้ำดื่มถัง 18.9 ลิตร (สำเร็จรูป)',
    category: 'finished_goods',
    unit: 'ถัง',
    stock: 500,
    min_stock: 50,
    unit_cost_sat: 600,
    unit_price_sat: 1500,
  },
  {
    sku: 'FG-350ML',
    name: 'น้ำดื่ม 350 มล. แพ็ค 12 ขวด',
    category: 'finished_goods',
    unit: 'แพ็ค',
    stock: 300,
    min_stock: 30,
    unit_cost_sat: 2200,
    unit_price_sat: 3500,
  },
  {
    sku: 'FG-600ML',
    name: 'น้ำดื่ม 600 มล. แพ็ค 12 ขวด',
    category: 'finished_goods',
    unit: 'แพ็ค',
    stock: 300,
    min_stock: 30,
    unit_cost_sat: 2400,
    unit_price_sat: 3800,
  },
  {
    sku: 'FG-1500ML',
    name: 'น้ำดื่ม 1500 มล. แพ็ค 6 ขวด',
    category: 'finished_goods',
    unit: 'แพ็ค',
    stock: 300,
    min_stock: 30,
    unit_cost_sat: 2500,
    unit_price_sat: 4000,
  },
  {
    sku: 'RET-189L-EMPTY',
    name: 'ถังเปล่า 18.9 ลิตร (หมุนเวียนในโรงงาน)',
    category: 'empty_bottle',
    unit: 'ถัง',
    stock: 200,
    min_stock: 30,
    unit_cost_sat: 12000,
    unit_price_sat: 0,
  },
];

export function upsertInventoryItem(item) {
  const db = getDb();
  const existing = db.prepare('SELECT sku FROM inventory_items WHERE sku = ?').get(item.sku);
  if (existing) {
    db.prepare(
      `UPDATE inventory_items
       SET name = ?, category = ?, unit = ?, stock = ?, min_stock = ?,
           unit_cost_sat = ?, unit_price_sat = ?, updated_at = datetime('now')
       WHERE sku = ?`,
    ).run(
      item.name,
      item.category,
      item.unit,
      Number(item.stock ?? 0),
      Number(item.min_stock ?? 0),
      Number(item.unit_cost_sat ?? 0),
      Number(item.unit_price_sat ?? 0),
      item.sku,
    );
    return { sku: item.sku, action: 'updated' };
  }

  db.prepare(
    `INSERT INTO inventory_items (
       sku, name, category, unit, stock, min_stock, unit_cost_sat, unit_price_sat, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    item.sku,
    item.name,
    item.category,
    item.unit,
    Number(item.stock ?? 0),
    Number(item.min_stock ?? 0),
    Number(item.unit_cost_sat ?? 0),
    Number(item.unit_price_sat ?? 0),
  );
  return { sku: item.sku, action: 'created' };
}

export function insertDefaultInventoryIfMissing(item) {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO inventory_items (
         sku, name, category, unit, stock, min_stock, unit_cost_sat, unit_price_sat, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      item.sku,
      item.name,
      item.category,
      item.unit,
      Number(item.stock ?? 0),
      Number(item.min_stock ?? 0),
      Number(item.unit_cost_sat ?? 0),
      Number(item.unit_price_sat ?? 0),
    );
  return res.changes > 0;
}

export function findInventoryItemBySku(sku) {
  return (
    getDb()
      .prepare(
        `SELECT sku, name, category, unit, stock, min_stock, unit_cost_sat, unit_price_sat, updated_at
         FROM inventory_items
         WHERE sku = ?`,
      )
      .get(sku) ?? null
  );
}

export function listInventoryItems({ category = '', lowStockOnly = false } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (lowStockOnly) {
    clauses.push('stock < min_stock');
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT sku, name, category, unit, stock, min_stock, unit_cost_sat, unit_price_sat, updated_at
       FROM inventory_items
       ${whereSql}
       ORDER BY
         CASE category
           WHEN 'finished_goods' THEN 1
           WHEN 'empty_bottle' THEN 2
           WHEN 'raw_material' THEN 3
           WHEN 'packaging' THEN 4
           WHEN 'spare_part' THEN 5
           ELSE 6
         END ASC,
         sku ASC`,
    )
    .all(...params);
}

export function updateInventoryItemFields(sku, fields) {
  const db = getDb();
  const sets = [];
  const params = [];

  if (fields.name !== undefined) {
    sets.push('name = ?');
    params.push(fields.name);
  }
  if (fields.unit !== undefined) {
    sets.push('unit = ?');
    params.push(fields.unit);
  }
  if (fields.min_stock !== undefined) {
    sets.push('min_stock = ?');
    params.push(fields.min_stock);
  }
  if (fields.unit_cost_sat !== undefined) {
    sets.push('unit_cost_sat = ?');
    params.push(fields.unit_cost_sat);
  }
  if (fields.unit_price_sat !== undefined) {
    sets.push('unit_price_sat = ?');
    params.push(fields.unit_price_sat);
  }

  sets.push("updated_at = datetime('now')");
  params.push(sku);

  const res = db
    .prepare(`UPDATE inventory_items SET ${sets.join(', ')} WHERE sku = ?`)
    .run(...params);
  return res.changes > 0;
}

export function setInventoryStock(sku, newStock) {
  const res = getDb()
    .prepare(
      `UPDATE inventory_items
       SET stock = ?, updated_at = datetime('now')
       WHERE sku = ?`,
    )
    .run(Number(newStock), sku);
  return res.changes > 0;
}

export function changeInventoryStockByDelta(sku, deltaQty) {
  const res = getDb()
    .prepare(
      `UPDATE inventory_items
       SET stock = stock + ?, updated_at = datetime('now')
       WHERE sku = ?`,
    )
    .run(Number(deltaQty), sku);
  return res.changes > 0;
}

export function insertStockMovement({
  sku,
  qtyChange,
  reason,
  refType = null,
  refId = null,
  lotNo = null,
  performedBy = null,
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO stock_movements (
         sku, qty_change, reason, ref_type, ref_id, lot_no, performed_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      sku,
      Number(qtyChange),
      reason,
      refType ?? null,
      refId ?? null,
      lotNo ?? null,
      performedBy ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function findStockMovementById(id) {
  return (
    getDb()
      .prepare(
        `SELECT m.id, m.sku, i.name AS item_name, i.unit AS item_unit,
                m.qty_change, m.reason, m.ref_type, m.ref_id, m.lot_no,
                m.performed_by, u.display_name AS performed_by_name, m.created_at
         FROM stock_movements m
         LEFT JOIN inventory_items i ON i.sku = m.sku
         LEFT JOIN users u ON u.id = m.performed_by
         WHERE m.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function listStockMovements({
  sku = '',
  reason = '',
  dateFrom = '',
  dateTo = '',
  page = 1,
  limit = 50,
} = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (sku) {
    clauses.push('m.sku = ?');
    params.push(sku);
  }
  if (reason) {
    clauses.push('m.reason = ?');
    params.push(reason);
  }
  if (dateFrom) {
    clauses.push('date(m.created_at) >= date(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('date(m.created_at) <= date(?)');
    params.push(dateTo);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM stock_movements m ${whereSql}`)
    .get(...params);
  const total = Number(totalRow?.count ?? 0);

  const offset = (page - 1) * limit;
  const rows = db
    .prepare(
      `SELECT m.id, m.sku, i.name AS item_name, i.unit AS item_unit,
              m.qty_change, m.reason, m.ref_type, m.ref_id, m.lot_no,
              m.performed_by, u.display_name AS performed_by_name, m.created_at
       FROM stock_movements m
       LEFT JOIN inventory_items i ON i.sku = m.sku
       LEFT JOIN users u ON u.id = m.performed_by
       ${whereSql}
       ORDER BY m.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total };
}
