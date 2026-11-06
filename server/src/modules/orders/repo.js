import { getDb } from '../../db/connection.js';

const ALLOWED_SORT_COLUMNS = {
  id: 'o.id',
  code: 'o.code',
  delivery_date: 'o.delivery_date',
  total_sat: 'o.total_sat',
  status: 'o.status',
  created_at: 'o.created_at',
};

export function runInTransaction(fn) {
  const db = getDb();
  return db.transaction(fn)();
}

export function buildOrderFilterWhere({
  customerId,
  zone,
  status,
  paymentStatus,
  dateFrom,
  dateTo,
  search,
}) {
  const where = [];
  const params = {};

  if (customerId !== undefined && customerId !== null) {
    where.push('o.customer_id = @customerId');
    params.customerId = Number(customerId);
  }

  if (status) {
    where.push('o.status = @status');
    params.status = status;
  }

  if (dateFrom) {
    where.push('o.delivery_date >= @dateFrom');
    params.dateFrom = dateFrom;
  }

  if (dateTo) {
    where.push('o.delivery_date <= @dateTo');
    params.dateTo = dateTo;
  }

  if (zone) {
    where.push('c.zone = @zone');
    params.zone = zone;
  }

  if (paymentStatus === 'paid') {
    where.push('o.total_sat > 0 AND o.paid_sat >= o.total_sat');
  } else if (paymentStatus === 'partial') {
    where.push('o.paid_sat > 0 AND o.paid_sat < o.total_sat');
  } else if (paymentStatus === 'unpaid') {
    where.push('o.paid_sat <= 0');
  }

  if (search) {
    where.push(
      `(
        (o.code >= @searchUpperStart AND o.code < @searchUpperEnd)
        OR (c.name >= @searchStart AND c.name < @searchEnd)
        OR (c.code >= @searchUpperStart AND c.code < @searchUpperEnd)
      )`,
    );
    params.searchStart = search;
    params.searchEnd = `${search}\uffff`;
    params.searchUpperStart = search.toUpperCase();
    params.searchUpperEnd = `${search.toUpperCase()}\uffff`;
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

export function listOrders({
  offset = 0,
  limit = 50,
  customerId,
  zone,
  status,
  paymentStatus,
  dateFrom,
  dateTo,
  search,
  sort = 'delivery_date',
  order = 'desc',
}) {
  const db = getDb();
  const { whereSql, params } = buildOrderFilterWhere({
    customerId,
    zone,
    status,
    paymentStatus,
    dateFrom,
    dateTo,
    search,
  });

  const sortCol = ALLOWED_SORT_COLUMNS[sort] || 'o.delivery_date';
  const sortDir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}`,
    )
    .get(params);

  const rows = db
    .prepare(
      `SELECT
         o.*,
         c.code AS customer_code,
         c.name AS customer_name,
         c.phone AS customer_phone,
         c.zone AS customer_zone,
         c.address AS customer_address,
         c.lat AS customer_lat,
         c.lng AS customer_lng
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY ${sortCol} ${sortDir}, o.id DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });

  return {
    rows,
    total: totalRow ? Number(totalRow.total) : 0,
  };
}

export function listAllOrdersForExport({
  customerId,
  zone,
  status,
  paymentStatus,
  dateFrom,
  dateTo,
  search,
  sort = 'delivery_date',
  order = 'desc',
}) {
  const db = getDb();
  const { whereSql, params } = buildOrderFilterWhere({
    customerId,
    zone,
    status,
    paymentStatus,
    dateFrom,
    dateTo,
    search,
  });

  const sortCol = ALLOWED_SORT_COLUMNS[sort] || 'o.delivery_date';
  const sortDir = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return db
    .prepare(
      `SELECT
         o.*,
         c.code AS customer_code,
         c.name AS customer_name,
         c.phone AS customer_phone,
         c.zone AS customer_zone,
         c.address AS customer_address
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY ${sortCol} ${sortDir}, o.id DESC`,
    )
    .all(params);
}

export function explainOrderQueryPlan(filters = {}) {
  const db = getDb();
  const { whereSql, params } = buildOrderFilterWhere(filters);
  return db
    .prepare(
      `EXPLAIN QUERY PLAN
       SELECT o.*, c.name AS customer_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       ${whereSql}
       ORDER BY o.delivery_date DESC
       LIMIT 50`,
    )
    .all(params);
}

export function findOrderById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT
           o.*,
           c.code AS customer_code,
           c.name AS customer_name,
           c.phone AS customer_phone,
           c.zone AS customer_zone,
           c.address AS customer_address,
           c.lat AS customer_lat,
           c.lng AS customer_lng
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.id = ?`,
      )
      .get(id) ?? null
  );
}

export function getOrderItemsByOrderId(orderId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, order_id, sku, qty, unit_price_sat, delivered_qty, returned_qty
       FROM order_items
       WHERE order_id = ?
       ORDER BY id ASC`,
    )
    .all(orderId);
}

export function getOrderItemsForOrderIds(orderIds) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) return [];
  const db = getDb();
  const placeholders = orderIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT id, order_id, sku, qty, unit_price_sat, delivered_qty, returned_qty
       FROM order_items
       WHERE order_id IN (${placeholders})
       ORDER BY id ASC`,
    )
    .all(...orderIds);
}

export function getMaxOrderCodeSeqForPrefix(prefix) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(code, @startPos) AS INTEGER)) AS max_seq
       FROM orders
       WHERE code >= @prefixStart AND code < @prefixEnd`,
    )
    .get({
      startPos: prefix.length + 1,
      prefixStart: prefix,
      prefixEnd: `${prefix}\uffff`,
    });
  return row && row.max_seq != null ? Number(row.max_seq) : 0;
}

export function insertOrder({
  code,
  customerId,
  status = 'draft',
  deliveryDate,
  totalSat,
  paidSat = 0,
  paymentMode = null,
  notes = null,
  source = 'staff',
  createdBy = null,
}) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO orders (
         code,
         customer_id,
         status,
         delivery_date,
         total_sat,
         paid_sat,
         payment_mode,
         notes,
         source,
         created_by
       ) VALUES (
         @code,
         @customerId,
         @status,
         @deliveryDate,
         @totalSat,
         @paidSat,
         @paymentMode,
         @notes,
         @source,
         @createdBy
       )`,
    )
    .run({
      code,
      customerId,
      status,
      deliveryDate,
      totalSat,
      paidSat,
      paymentMode,
      notes,
      source,
      createdBy,
    });

  return Number(info.lastInsertRowid);
}

export function replaceOrderItems(orderId, items) {
  const db = getDb();
  db.prepare(`DELETE FROM order_items WHERE order_id = ?`).run(orderId);

  const insertStmt = db.prepare(
    `INSERT INTO order_items (order_id, sku, qty, unit_price_sat)
     VALUES (@orderId, @sku, @qty, @unitPriceSat)`,
  );

  for (const item of items) {
    if (Number(item.qty) > 0) {
      insertStmt.run({
        orderId,
        sku: item.sku,
        qty: item.qty,
        unitPriceSat: item.unitPriceSat,
      });
    }
  }
}

export function updateOrderById(id, fields) {
  const db = getDb();
  const sets = ["updated_at = datetime('now')"];
  const params = { id };

  const columnMap = {
    customerId: 'customer_id',
    status: 'status',
    deliveryDate: 'delivery_date',
    totalSat: 'total_sat',
    paidSat: 'paid_sat',
    paymentMode: 'payment_mode',
    notes: 'notes',
    completedAt: 'completed_at',
  };

  for (const [key, col] of Object.entries(columnMap)) {
    if (fields[key] !== undefined) {
      sets.push(`${col} = @${key}`);
      params[key] = fields[key];
    }
  }

  db.prepare(`UPDATE orders SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return findOrderById(id);
}

export function listOrderCheckins(orderId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         id,
         order_id,
         customer_id,
         trip_id,
         delivered_json,
         returned_189l,
         payment_mode,
         money_received_sat,
         notes,
         performed_by,
         created_at
       FROM checkins
       WHERE order_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(orderId);
}

export function listOrderReceipts(orderId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         id,
         code,
         customer_id,
         order_id,
         checkin_id,
         amount_sat,
         method,
         printed,
         created_by,
         created_at
       FROM payment_receipts
       WHERE order_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(orderId);
}

export function listActiveOrdersByDateAndZone({ date, zone }) {
  const db = getDb();
  const where = ["o.delivery_date = @date", "o.status IN ('draft', 'confirmed')"];
  const params = { date };

  if (zone) {
    where.push('c.zone = @zone');
    params.zone = zone;
  }

  return db
    .prepare(
      `SELECT
         o.id,
         o.code,
         o.customer_id,
         o.status,
         o.delivery_date,
         o.total_sat,
         o.paid_sat,
         o.payment_mode,
         o.notes,
         c.code AS customer_code,
         c.name AS customer_name,
         c.phone AS customer_phone,
         c.zone AS customer_zone,
         c.address AS customer_address,
         c.lat AS customer_lat,
         c.lng AS customer_lng,
         c.outstanding_bottles AS customer_outstanding_bottles,
         c.balance_sat AS customer_balance_sat
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.zone ASC, c.id ASC, o.id ASC`,
    )
    .all(params);
}

export function listRecentCustomerOrdersOnDate(customerId, deliveryDate, limit = 10) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, code, customer_id, delivery_date, status, total_sat, created_at
       FROM orders
       WHERE customer_id = ? AND delivery_date = ? AND status != 'cancelled'
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(customerId, deliveryDate, limit);
}
