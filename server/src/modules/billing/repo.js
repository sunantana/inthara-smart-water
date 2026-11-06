import { getDb } from '../../db/connection.js';

export function updateCustomerBalanceSat(customerId, newBalanceSat) {
  const res = getDb()
    .prepare(
      `UPDATE customers
       SET balance_sat = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(Math.max(0, Number(newBalanceSat ?? 0)), Number(customerId));
  return res.changes > 0;
}

export function insertLedgerEntry({
  customerId,
  entryType,
  amountSat,
  refType = null,
  refId = null,
  note = '',
  createdBy = null,
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO customer_ledger (
         customer_id, entry_type, amount_sat, ref_type, ref_id, note, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      Number(customerId),
      entryType,
      Number(amountSat),
      refType ?? null,
      refId ?? null,
      note ?? '',
      createdBy ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function findLedgerEntryById(id) {
  return (
    getDb()
      .prepare(
        `SELECT l.*, u.display_name AS created_by_name, u.username AS created_by_username
         FROM customer_ledger l
         LEFT JOIN users u ON u.id = l.created_by
         WHERE l.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function buildUnpaidOrdersWhere({
  zone = '',
  aging = '',
  customerId,
  search = '',
} = {}) {
  const clauses = ["o.status = 'delivered'", 'o.paid_sat < o.total_sat'];
  const params = [];

  if (zone) {
    clauses.push('c.zone = ?');
    params.push(zone);
  }

  if (customerId !== undefined && customerId !== null) {
    clauses.push('o.customer_id = ?');
    params.push(Number(customerId));
  }

  if (search) {
    clauses.push('(o.code LIKE ? OR c.name LIKE ? OR c.code LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const ageExpr =
    "(julianday('now') - julianday(COALESCE(o.completed_at, o.delivery_date, o.created_at)))";

  if (aging === 'unpaid30' || aging === '30') {
    clauses.push(`${ageExpr} >= 30`);
  } else if (aging === 'unpaid60' || aging === '60') {
    clauses.push(`${ageExpr} >= 60`);
  } else if (aging === 'unpaid90' || aging === '90') {
    clauses.push(`${ageExpr} >= 90`);
  }

  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    params,
    ageExpr,
  };
}

export function listUnpaidOrders({
  zone = '',
  aging = '',
  customerId,
  search = '',
  page = 1,
  limit = 50,
} = {}) {
  const db = getDb();
  const { whereSql, params, ageExpr } = buildUnpaidOrdersWhere({
    zone,
    aging,
    customerId,
    search,
  });

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}`,
    )
    .get(...params);
  const total = Number(totalRow?.count ?? 0);

  const offset = (page - 1) * limit;
  const rows = db
    .prepare(
      `SELECT o.*,
              c.code AS customer_code,
              c.name AS customer_name,
              c.phone AS customer_phone,
              c.zone AS customer_zone,
              c.address AS customer_address,
              c.balance_sat AS customer_balance_sat,
              c.outstanding_bottles AS customer_outstanding_bottles,
              CAST(MAX(0, ${ageExpr}) AS INTEGER) AS age_days
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY COALESCE(o.completed_at, o.delivery_date, o.created_at) ASC, o.id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  const allMatchingRows = db
    .prepare(
      `SELECT o.id, o.customer_id, o.total_sat, o.paid_sat,
              c.code AS customer_code, c.name AS customer_name, c.zone AS customer_zone,
              c.phone AS customer_phone, c.balance_sat AS customer_balance_sat,
              c.outstanding_bottles AS customer_outstanding_bottles,
              CAST(MAX(0, ${ageExpr}) AS INTEGER) AS age_days
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY COALESCE(o.completed_at, o.delivery_date, o.created_at) ASC, o.id ASC`,
    )
    .all(...params);

  return { rows, total, allMatchingRows };
}

export function listCustomerUnpaidOrdersFifo(customerId) {
  const ageExpr =
    "(julianday('now') - julianday(COALESCE(o.completed_at, o.delivery_date, o.created_at)))";
  return getDb()
    .prepare(
      `SELECT o.*,
              CAST(MAX(0, ${ageExpr}) AS INTEGER) AS age_days
       FROM orders o
       WHERE o.customer_id = ?
         AND o.status = 'delivered'
         AND o.paid_sat < o.total_sat
       ORDER BY COALESCE(o.completed_at, o.delivery_date, o.created_at) ASC, o.id ASC`,
    )
    .all(Number(customerId));
}

export function updateOrderPaidSat(orderId, newPaidSat) {
  getDb()
    .prepare(
      `UPDATE orders
       SET paid_sat = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(Math.max(0, Number(newPaidSat ?? 0)), Number(orderId));
}

export function findReceiptDetailById(receiptId) {
  return (
    getDb()
      .prepare(
        `SELECT pr.*,
                c.code AS customer_code,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.address AS customer_address,
                c.zone AS customer_zone,
                c.balance_sat AS customer_balance_sat,
                c.outstanding_bottles AS customer_outstanding_bottles,
                o.code AS order_code,
                o.delivery_date AS order_delivery_date,
                o.total_sat AS order_total_sat,
                o.paid_sat AS order_paid_sat,
                u.display_name AS created_by_name,
                u.username AS created_by_username
         FROM payment_receipts pr
         JOIN customers c ON c.id = pr.customer_id
         LEFT JOIN orders o ON o.id = pr.order_id
         LEFT JOIN users u ON u.id = pr.created_by
         WHERE pr.id = ?`,
      )
      .get(Number(receiptId)) ?? null
  );
}

export function listLedgerEntriesByReceiptCode(receiptCode) {
  return getDb()
    .prepare(
      `SELECT l.*, u.display_name AS created_by_name
       FROM customer_ledger l
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.ref_type = 'receipt' AND l.ref_id = ?
       ORDER BY l.id ASC`,
    )
    .all(String(receiptCode));
}

export function listRecentReceiptsByCustomer(customerId, limit = 20) {
  return getDb()
    .prepare(
      `SELECT pr.*, o.code AS order_code, u.display_name AS created_by_name
       FROM payment_receipts pr
       LEFT JOIN orders o ON o.id = pr.order_id
       LEFT JOIN users u ON u.id = pr.created_by
       WHERE pr.customer_id = ?
       ORDER BY pr.id DESC
       LIMIT ?`,
    )
    .all(Number(customerId), Number(limit));
}

export function listRecentLedgerByCustomer(customerId, limit = 30) {
  return getDb()
    .prepare(
      `SELECT l.*, u.display_name AS created_by_name
       FROM customer_ledger l
       LEFT JOIN users u ON u.id = l.created_by
       WHERE l.customer_id = ?
       ORDER BY l.id DESC
       LIMIT ?`,
    )
    .all(Number(customerId), Number(limit));
}
