import { getDb } from '../../db/connection.js';

export function listPriceTiers({ isActive } = {}) {
  const db = getDb();
  const where = [];
  const params = {};

  if (typeof isActive === 'boolean') {
    where.push('pt.is_active = @isActive');
    params.isActive = isActive ? 1 : 0;
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT
         pt.id,
         pt.name,
         pt.price_189l_sat,
         pt.price_350ml_sat,
         pt.price_600ml_sat,
         pt.price_1500ml_sat,
         pt.is_active,
         pt.created_at,
         pt.updated_at,
         (SELECT COUNT(*) FROM customers c WHERE c.price_tier_id = pt.id) AS customer_count
       FROM price_tiers pt
       ${whereSql}
       ORDER BY pt.id ASC`,
    )
    .all(params);
}

export function findPriceTierById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT
           pt.id,
           pt.name,
           pt.price_189l_sat,
           pt.price_350ml_sat,
           pt.price_600ml_sat,
           pt.price_1500ml_sat,
           pt.is_active,
           pt.created_at,
           pt.updated_at,
           (SELECT COUNT(*) FROM customers c WHERE c.price_tier_id = pt.id) AS customer_count
         FROM price_tiers pt
         WHERE pt.id = ?`,
      )
      .get(id) ?? null
  );
}

export function findPriceTierByName(name) {
  const db = getDb();
  return db.prepare(`SELECT * FROM price_tiers WHERE name = ?`).get(name) ?? null;
}

export function insertPriceTier({
  name,
  price189lSat,
  price350mlSat,
  price600mlSat,
  price1500mlSat,
  isActive = true,
}) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO price_tiers (
         name,
         price_189l_sat,
         price_350ml_sat,
         price_600ml_sat,
         price_1500ml_sat,
         is_active
       ) VALUES (
         @name,
         @price189lSat,
         @price350mlSat,
         @price600mlSat,
         @price1500mlSat,
         @isActive
       )`,
    )
    .run({
      name,
      price189lSat,
      price350mlSat,
      price600mlSat,
      price1500mlSat,
      isActive: isActive ? 1 : 0,
    });

  return findPriceTierById(Number(info.lastInsertRowid));
}

export function updatePriceTierById(id, fields) {
  const db = getDb();
  const sets = ["updated_at = datetime('now')"];
  const params = { id };

  if (fields.name !== undefined) {
    sets.push('name = @name');
    params.name = fields.name;
  }
  if (fields.price189lSat !== undefined) {
    sets.push('price_189l_sat = @price189lSat');
    params.price189lSat = fields.price189lSat;
  }
  if (fields.price350mlSat !== undefined) {
    sets.push('price_350ml_sat = @price350mlSat');
    params.price350mlSat = fields.price350mlSat;
  }
  if (fields.price600mlSat !== undefined) {
    sets.push('price_600ml_sat = @price600mlSat');
    params.price600mlSat = fields.price600mlSat;
  }
  if (fields.price1500mlSat !== undefined) {
    sets.push('price_1500ml_sat = @price1500mlSat');
    params.price1500mlSat = fields.price1500mlSat;
  }
  if (fields.isActive !== undefined) {
    sets.push('is_active = @isActive');
    params.isActive = fields.isActive ? 1 : 0;
  }

  db.prepare(`UPDATE price_tiers SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return findPriceTierById(id);
}

export function countCustomersUsingTier(tierId) {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM customers WHERE price_tier_id = ?`)
    .get(tierId);
  return row ? Number(row.total) : 0;
}

export function deletePriceTierById(id) {
  const db = getDb();
  return db.prepare(`DELETE FROM price_tiers WHERE id = ?`).run(id);
}
