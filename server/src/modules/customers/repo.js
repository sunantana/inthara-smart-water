import { getDb } from '../../db/connection.js';

const ALLOWED_SORT_COLUMNS = {
  id: 'c.id',
  code: 'c.code',
  name: 'c.name',
  zone: 'c.zone',
  outstanding_bottles: 'c.outstanding_bottles',
  balance_sat: 'c.balance_sat',
  created_at: 'c.created_at',
};

export function runInTransaction(fn) {
  const db = getDb();
  return db.transaction(fn)();
}

export function buildCustomerFilterWhere({ search, zone, type, isActive }) {
  const where = [];
  const params = {};

  if (typeof isActive === 'boolean') {
    where.push('c.is_active = @isActive');
    params.isActive = isActive ? 1 : 0;
  }

  if (zone) {
    where.push('c.zone = @zone');
    params.zone = zone;
  }

  if (type) {
    where.push('c.customer_type = @type');
    params.type = type;
  }

  if (search) {
    where.push(
      `(
        (c.name >= @searchStart AND c.name < @searchEnd)
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

export function listCustomers({
  offset = 0,
  limit = 50,
  search,
  zone,
  type,
  isActive,
  sort = 'id',
  order = 'asc',
}) {
  const db = getDb();
  const { whereSql, params } = buildCustomerFilterWhere({ search, zone, type, isActive });
  const sortCol = ALLOWED_SORT_COLUMNS[sort] || 'c.id';
  const sortDir = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM customers c ${whereSql}`)
    .get(params);

  const rows = db
    .prepare(
      `SELECT
         c.*,
         pt.name AS price_tier_name,
         pt.price_189l_sat AS tier_189l_sat,
         pt.price_350ml_sat AS tier_350ml_sat,
         pt.price_600ml_sat AS tier_600ml_sat,
         pt.price_1500ml_sat AS tier_1500ml_sat
       FROM customers c
       LEFT JOIN price_tiers pt ON pt.id = c.price_tier_id
       ${whereSql}
       ORDER BY ${sortCol} ${sortDir}, c.id ASC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset });

  return {
    rows,
    total: totalRow ? Number(totalRow.total) : 0,
  };
}

export function listAllCustomersForExport({ search, zone, type, isActive, sort = 'id', order = 'asc' }) {
  const db = getDb();
  const { whereSql, params } = buildCustomerFilterWhere({ search, zone, type, isActive });
  const sortCol = ALLOWED_SORT_COLUMNS[sort] || 'c.id';
  const sortDir = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return db
    .prepare(
      `SELECT
         c.*,
         pt.name AS price_tier_name,
         pt.price_189l_sat AS tier_189l_sat,
         pt.price_350ml_sat AS tier_350ml_sat,
         pt.price_600ml_sat AS tier_600ml_sat,
         pt.price_1500ml_sat AS tier_1500ml_sat
       FROM customers c
       LEFT JOIN price_tiers pt ON pt.id = c.price_tier_id
       ${whereSql}
       ORDER BY ${sortCol} ${sortDir}, c.id ASC`,
    )
    .all(params);
}

export function explainCustomerQueryPlan({ search, zone, type, isActive }) {
  const db = getDb();
  const { whereSql, params } = buildCustomerFilterWhere({ search, zone, type, isActive });
  return db
    .prepare(`EXPLAIN QUERY PLAN SELECT c.* FROM customers c ${whereSql} ORDER BY c.name ASC LIMIT 50`)
    .all(params);
}

export function findCustomerById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT
           c.*,
           pt.name AS price_tier_name,
           pt.price_189l_sat AS tier_189l_sat,
           pt.price_350ml_sat AS tier_350ml_sat,
           pt.price_600ml_sat AS tier_600ml_sat,
           pt.price_1500ml_sat AS tier_1500ml_sat
         FROM customers c
         LEFT JOIN price_tiers pt ON pt.id = c.price_tier_id
         WHERE c.id = ?`,
      )
      .get(id) ?? null
  );
}

export function findPriceTierById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM price_tiers WHERE id = ?`).get(id) ?? null;
}

export function getMaxCustomerCodeSeq() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS max_seq
       FROM customers
       WHERE code LIKE 'CUS-%'`,
    )
    .get();
  return row && row.max_seq != null ? Number(row.max_seq) : 0;
}

export function insertCustomer(data) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO customers (
         code,
         customer_type,
         name,
         contact_person,
         phone,
         tax_id,
         branch_type,
         zone,
         house_no,
         moo,
         subdistrict,
         district,
         province,
         postal_code,
         address,
         lat,
         lng,
         price_tier_id,
         outstanding_bottles,
         balance_sat,
         credit_term_days,
         is_active
       ) VALUES (
         @code,
         @customerType,
         @name,
         @contactPerson,
         @phone,
         @taxId,
         @branchType,
         @zone,
         @houseNo,
         @moo,
         @subdistrict,
         @district,
         @province,
         @postalCode,
         @address,
         @lat,
         @lng,
         @priceTierId,
         @outstandingBottles,
         @balanceSat,
         @creditTermDays,
         @isActive
       )`,
    )
    .run({
      code: data.code,
      customerType: data.customerType,
      name: data.name,
      contactPerson: data.contactPerson ?? null,
      phone: data.phone ?? null,
      taxId: data.taxId ?? null,
      branchType: data.branchType ?? null,
      zone: data.zone ?? null,
      houseNo: data.houseNo ?? null,
      moo: data.moo ?? null,
      subdistrict: data.subdistrict ?? null,
      district: data.district ?? null,
      province: data.province ?? null,
      postalCode: data.postalCode ?? null,
      address: data.address ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      priceTierId: data.priceTierId ?? null,
      outstandingBottles: data.outstandingBottles ?? 0,
      balanceSat: data.balanceSat ?? 0,
      creditTermDays: data.creditTermDays ?? 0,
      isActive: data.isActive === false ? 0 : 1,
    });

  return Number(info.lastInsertRowid);
}

export function updateCustomerById(id, fields) {
  const db = getDb();
  const sets = ["updated_at = datetime('now')"];
  const params = { id };

  const columnMap = {
    customerType: 'customer_type',
    name: 'name',
    contactPerson: 'contact_person',
    phone: 'phone',
    taxId: 'tax_id',
    branchType: 'branch_type',
    zone: 'zone',
    houseNo: 'house_no',
    moo: 'moo',
    subdistrict: 'subdistrict',
    district: 'district',
    province: 'province',
    postalCode: 'postal_code',
    address: 'address',
    lat: 'lat',
    lng: 'lng',
    priceTierId: 'price_tier_id',
    outstandingBottles: 'outstanding_bottles',
    balanceSat: 'balance_sat',
    creditTermDays: 'credit_term_days',
  };

  for (const [key, col] of Object.entries(columnMap)) {
    if (fields[key] !== undefined) {
      sets.push(`${col} = @${key}`);
      params[key] = fields[key];
    }
  }

  if (fields.isActive !== undefined) {
    sets.push('is_active = @isActive');
    params.isActive = fields.isActive ? 1 : 0;
  }

  db.prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return findCustomerById(id);
}

export function softDeleteCustomerById(id) {
  const db = getDb();
  db.prepare(`UPDATE customers SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(
    id,
  );
  return findCustomerById(id);
}

export function countActiveOrdersByCustomer(customerId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM orders
       WHERE customer_id = ? AND status IN ('draft', 'confirmed')`,
    )
    .get(customerId);
  return row ? Number(row.total) : 0;
}

export function getCustomerPrices(customerId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT customer_id, sku, unit_price_sat, updated_by, updated_at
       FROM customer_prices
       WHERE customer_id = ?`,
    )
    .all(customerId);
}

export function getCustomerPricesForIds(customerIds) {
  if (!Array.isArray(customerIds) || customerIds.length === 0) return [];
  const db = getDb();
  const placeholders = customerIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT customer_id, sku, unit_price_sat, updated_by, updated_at
       FROM customer_prices
       WHERE customer_id IN (${placeholders})`,
    )
    .all(...customerIds);
}

export function upsertCustomerPrice({ customerId, sku, unitPriceSat, updatedBy = null }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO customer_prices (customer_id, sku, unit_price_sat, updated_by, updated_at)
     VALUES (@customerId, @sku, @unitPriceSat, @updatedBy, datetime('now'))
     ON CONFLICT(customer_id, sku) DO UPDATE SET
       unit_price_sat = excluded.unit_price_sat,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
  ).run({ customerId, sku, unitPriceSat, updatedBy });
}

export function insertCustomerPriceHistory({
  customerId,
  sku,
  oldPriceSat = null,
  newPriceSat,
  changedBy = null,
}) {
  const db = getDb();
  db.prepare(
    `INSERT INTO customer_price_history (
       customer_id,
       sku,
       old_price_sat,
       new_price_sat,
       changed_by
     ) VALUES (
       @customerId,
       @sku,
       @oldPriceSat,
       @newPriceSat,
       @changedBy
     )`,
  ).run({
    customerId,
    sku,
    oldPriceSat,
    newPriceSat,
    changedBy,
  });
}

export function listCustomerPriceHistory(customerId, limit = 50) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         h.id,
         h.customer_id,
         h.sku,
         h.old_price_sat,
         h.new_price_sat,
         h.changed_by,
         u.username AS changed_by_username,
         u.display_name AS changed_by_name,
         h.created_at
       FROM customer_price_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.customer_id = ?
       ORDER BY h.created_at DESC, h.id DESC
       LIMIT ?`,
    )
    .all(customerId, limit);
}

export function listRecentCustomerOrders(customerId, limit = 5) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         id,
         code,
         customer_id,
         status,
         delivery_date,
         total_sat,
         paid_sat,
         payment_mode,
         notes,
         created_at
       FROM orders
       WHERE customer_id = ?
       ORDER BY delivery_date DESC, id DESC
       LIMIT ?`,
    )
    .all(customerId, limit);
}

export function listCustomerOrdersPaginated(customerId, { offset = 0, limit = 50 } = {}) {
  const db = getDb();
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?`)
    .get(customerId);
  const rows = db
    .prepare(
      `SELECT
         id,
         code,
         customer_id,
         status,
         delivery_date,
         total_sat,
         paid_sat,
         payment_mode,
         notes,
         created_at
       FROM orders
       WHERE customer_id = ?
       ORDER BY delivery_date DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(customerId, limit, offset);

  return {
    rows,
    total: totalRow ? Number(totalRow.total) : 0,
  };
}

export function listCustomerLedgerPaginated(customerId, { offset = 0, limit = 50 } = {}) {
  const db = getDb();
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM customer_ledger WHERE customer_id = ?`)
    .get(customerId);
  const rows = db
    .prepare(
      `SELECT
         id,
         customer_id,
         entry_type,
         amount_sat,
         ref_type,
         ref_id,
         note,
         created_by,
         created_at
       FROM customer_ledger
       WHERE customer_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(customerId, limit, offset);

  return {
    rows,
    total: totalRow ? Number(totalRow.total) : 0,
  };
}
