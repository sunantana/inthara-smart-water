import { getDb } from '../../db/connection.js';

export function findCheckinByOrderId(orderId) {
  return (
    getDb()
      .prepare('SELECT id, order_id, created_at FROM checkins WHERE order_id = ? LIMIT 1')
      .get(Number(orderId)) ?? null
  );
}

export function findCheckinById(checkinId) {
  return (
    getDb()
      .prepare(
        `SELECT ck.*,
                o.code AS order_code,
                o.delivery_date AS order_delivery_date,
                o.total_sat AS order_total_sat,
                o.paid_sat AS order_paid_sat,
                c.code AS customer_code,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.address AS customer_address,
                c.zone AS customer_route,
                c.outstanding_bottles AS customer_outstanding_bottles,
                u.display_name AS performed_by_name,
                u.username AS performed_by_username
         FROM checkins ck
         JOIN orders o ON o.id = ck.order_id
         JOIN customers c ON c.id = ck.customer_id
         LEFT JOIN users u ON u.id = ck.performed_by
         WHERE ck.id = ?`,
      )
      .get(Number(checkinId)) ?? null
  );
}

export function insertCheckin({
  orderId,
  customerId,
  tripId = null,
  deliveredJson,
  returned189L = 0,
  paymentMode = 'cash',
  moneyReceivedSat = 0,
  notes = '',
  performedBy = null,
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO checkins (
         order_id, customer_id, trip_id, delivered_json, returned_189l,
         payment_mode, money_received_sat, notes, performed_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      Number(orderId),
      Number(customerId),
      tripId ?? null,
      deliveredJson,
      Number(returned189L ?? 0),
      paymentMode,
      Number(moneyReceivedSat ?? 0),
      notes ?? '',
      performedBy ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function updateOrderDelivered({
  orderId,
  totalSat,
  paidSat,
  paymentMode,
}) {
  getDb()
    .prepare(
      `UPDATE orders
       SET status = 'delivered',
           total_sat = ?,
           paid_sat = ?,
           payment_mode = ?,
           completed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(Number(totalSat), Number(paidSat), paymentMode, Number(orderId));
}

export function updateOrderItemDelivered({ itemId, deliveredQty, returnedQty }) {
  getDb()
    .prepare(
      `UPDATE order_items
       SET delivered_qty = ?, returned_qty = ?
       WHERE id = ?`,
    )
    .run(Number(deliveredQty), Number(returnedQty), Number(itemId));
}

export function insertExtraOrderItemOnCheckin({
  orderId,
  sku,
  qty = 0,
  unitPriceSat = 0,
  deliveredQty = 0,
  returnedQty = 0,
}) {
  getDb()
    .prepare(
      `INSERT INTO order_items (order_id, sku, qty, unit_price_sat, delivered_qty, returned_qty)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      Number(orderId),
      sku,
      Number(qty),
      Number(unitPriceSat),
      Number(deliveredQty),
      Number(returnedQty),
    );
}

export function updateCustomerOutstandingBottles(customerId, newOutstandingBottles) {
  getDb()
    .prepare(
      `UPDATE customers
       SET outstanding_bottles = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(Number(newOutstandingBottles), Number(customerId));
}

export function getMaxReceiptCodeSeqForPrefix(prefix) {
  const row = getDb()
    .prepare('SELECT MAX(code) AS max_code FROM payment_receipts WHERE code LIKE ?')
    .get(`${prefix}%`);
  if (!row || !row.max_code) return 0;
  const suffix = String(row.max_code).slice(prefix.length);
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function insertPaymentReceipt({
  code,
  customerId,
  orderId = null,
  checkinId = null,
  amountSat,
  method = 'cash',
  createdBy = null,
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO payment_receipts (
         code, customer_id, order_id, checkin_id, amount_sat, method, printed, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))`,
    )
    .run(
      code,
      Number(customerId),
      orderId ?? null,
      checkinId ?? null,
      Number(amountSat),
      method,
      createdBy ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function findReceiptById(receiptId) {
  if (!receiptId) return null;
  return (
    getDb()
      .prepare('SELECT * FROM payment_receipts WHERE id = ?')
      .get(Number(receiptId)) ?? null
  );
}

export function findReceiptByCheckinId(checkinId) {
  return (
    getDb()
      .prepare('SELECT * FROM payment_receipts WHERE checkin_id = ? ORDER BY id DESC LIMIT 1')
      .get(Number(checkinId)) ?? null
  );
}

export function insertCustomerLedgerEntry({
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

export function getCustomerFinancialSummary(customerId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT entry_type, COALESCE(SUM(amount_sat), 0) AS total_sat
       FROM customer_ledger
       WHERE customer_id = ?
       GROUP BY entry_type`,
    )
    .all(Number(customerId));

  const sums = {
    order_debt: 0,
    payment: 0,
    deposit_in: 0,
    deposit_use: 0,
    deposit_refund: 0,
    adjustment: 0,
  };

  for (const row of rows) {
    if (row.entry_type in sums) {
      sums[row.entry_type] = Number(row.total_sat ?? 0);
    }
  }

  return sums;
}

export function listCheckins({
  date = '',
  dateFrom = '',
  dateTo = '',
  driverId,
  customerId,
  orderId,
  paymentMode = '',
  page = 1,
  limit = 50,
} = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (date) {
    clauses.push('(date(ck.created_at) = date(?) OR o.delivery_date = ?)');
    params.push(date, date);
  }
  if (dateFrom) {
    clauses.push('date(ck.created_at) >= date(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('date(ck.created_at) <= date(?)');
    params.push(dateTo);
  }
  if (driverId !== undefined && driverId !== null) {
    clauses.push('ck.performed_by = ?');
    params.push(Number(driverId));
  }
  if (customerId !== undefined && customerId !== null) {
    clauses.push('ck.customer_id = ?');
    params.push(Number(customerId));
  }
  if (orderId !== undefined && orderId !== null) {
    clauses.push('ck.order_id = ?');
    params.push(Number(orderId));
  }
  if (paymentMode) {
    clauses.push('ck.payment_mode = ?');
    params.push(paymentMode);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM checkins ck
       JOIN orders o ON o.id = ck.order_id
       ${whereSql}`,
    )
    .get(...params);
  const total = Number(totalRow?.count ?? 0);

  const offset = (page - 1) * limit;
  const rows = db
    .prepare(
      `SELECT ck.*,
              o.code AS order_code,
              o.delivery_date AS order_delivery_date,
              o.total_sat AS order_total_sat,
              o.paid_sat AS order_paid_sat,
              c.code AS customer_code,
              c.name AS customer_name,
              c.phone AS customer_phone,
              c.address AS customer_address,
              c.zone AS customer_route,
              c.outstanding_bottles AS customer_outstanding_bottles,
              u.display_name AS performed_by_name,
              u.username AS performed_by_username,
              pr.id AS receipt_id,
              pr.code AS receipt_code,
              pr.amount_sat AS receipt_amount_sat
       FROM checkins ck
       JOIN orders o ON o.id = ck.order_id
       JOIN customers c ON c.id = ck.customer_id
       LEFT JOIN users u ON u.id = ck.performed_by
       LEFT JOIN payment_receipts pr ON pr.checkin_id = ck.id
       ${whereSql}
       ORDER BY ck.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total };
}
