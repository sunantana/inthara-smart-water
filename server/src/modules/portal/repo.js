import { getDb } from '../../db/connection.js';

export function findCustomerByCode(code) {
  if (!code) return null;
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT c.*,
                pt.name AS price_tier_name,
                pt.price_189l_sat AS tier_189l_sat,
                pt.price_350ml_sat AS tier_350ml_sat,
                pt.price_600ml_sat AS tier_600ml_sat,
                pt.price_1500ml_sat AS tier_1500ml_sat
         FROM customers c
         LEFT JOIN price_tiers pt ON pt.id = c.price_tier_id
         WHERE LOWER(c.code) = LOWER(?) AND c.is_active = 1`,
      )
      .get(String(code).trim()) ?? null
  );
}

export function findCustomerById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT c.*,
                pt.name AS price_tier_name,
                pt.price_189l_sat AS tier_189l_sat,
                pt.price_350ml_sat AS tier_350ml_sat,
                pt.price_600ml_sat AS tier_600ml_sat,
                pt.price_1500ml_sat AS tier_1500ml_sat
         FROM customers c
         LEFT JOIN price_tiers pt ON pt.id = c.price_tier_id
         WHERE c.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function findPortalAuthByCustomerId(customerId) {
  const db = getDb();
  return (
    db
      .prepare('SELECT * FROM customer_portal_auth WHERE customer_id = ?')
      .get(Number(customerId)) ?? null
  );
}

export function upsertPortalAuth({ customerId, pinHash, enabled = 1 }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO customer_portal_auth (customer_id, pin_hash, enabled, failed_attempts, lock_until, registered_at)
     VALUES (?, ?, ?, 0, NULL, datetime('now'))
     ON CONFLICT(customer_id) DO UPDATE SET
       pin_hash = excluded.pin_hash,
       enabled = excluded.enabled,
       failed_attempts = 0,
       lock_until = NULL`,
  ).run(Number(customerId), String(pinHash), enabled ? 1 : 0);
}

export function updatePortalAttempts(customerId, failedAttempts, lockUntil = null) {
  const db = getDb();
  db.prepare(
    `UPDATE customer_portal_auth
     SET failed_attempts = ?, lock_until = ?
     WHERE customer_id = ?`,
  ).run(Number(failedAttempts), lockUntil ? String(lockUntil) : null, Number(customerId));
}

export function resetPortalLock(customerId) {
  const db = getDb();
  db.prepare(
    `UPDATE customer_portal_auth
     SET failed_attempts = 0, lock_until = NULL, enabled = 1
     WHERE customer_id = ?`,
  ).run(Number(customerId));
}

export function listRecentOrders3Months(customerId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT o.*
       FROM orders o
       WHERE o.customer_id = ?
         AND o.delivery_date >= date('now', '-90 days')
       ORDER BY o.delivery_date DESC, o.id DESC
       LIMIT 50`,
    )
    .all(Number(customerId));
}

export function listCustomerOrdersPaginated(customerId, { page = 1, limit = 20 } = {}) {
  const db = getDb();
  const cid = Number(customerId);
  const countRow = db
    .prepare('SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?')
    .get(cid);
  const total = Number(countRow?.total ?? 0);

  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  const rows = db
    .prepare(
      `SELECT o.*
       FROM orders o
       WHERE o.customer_id = ?
       ORDER BY o.delivery_date DESC, o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(cid, Number(limit), offset);

  return { rows, total };
}

export function getOrderItemsForOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return [];
  const db = getDb();
  const placeholders = orderIds.map(() => '?').join(', ');
  return db
    .prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`)
    .all(...orderIds);
}
