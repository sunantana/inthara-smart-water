import { getDb } from '../../db/connection.js';

export function listExpenses({ category, dateFrom, dateTo, refType, refId, page = 1, limit = 50 } = {}) {
  const db = getDb();
  const where = ['1 = 1'];
  const params = [];

  if (category) {
    where.push('e.category = ?');
    params.push(category);
  }
  if (dateFrom) {
    where.push('e.date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('e.date <= ?');
    params.push(dateTo);
  }
  if (refType) {
    where.push('e.ref_type = ?');
    params.push(refType);
  }
  if (refId) {
    where.push('e.ref_id = ?');
    params.push(refId);
  }

  const whereSql = where.join(' AND ');
  const countRow = db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(e.amount_sat), 0) AS total_amount_sat FROM expenses e WHERE ${whereSql}`)
    .get(...params);
  const total = Number(countRow?.total ?? 0);
  const totalAmountSat = Number(countRow?.total_amount_sat ?? 0);

  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  const rows = db
    .prepare(
      `SELECT e.*, u.username AS created_by_username, u.display_name AS created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${whereSql}
       ORDER BY e.date DESC, e.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, Number(limit), offset);

  return { rows, total, totalAmountSat };
}

export function findExpenseById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT e.*, u.username AS created_by_username, u.display_name AS created_by_name
         FROM expenses e
         LEFT JOIN users u ON u.id = e.created_by
         WHERE e.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function insertExpense({ date, category, refType, refId, description, amountSat, createdBy }) {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO expenses (date, category, ref_type, ref_id, description, amount_sat, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      date,
      category,
      refType ?? null,
      refId !== undefined && refId !== null && String(refId).trim() !== '' ? String(refId).trim() : null,
      description ?? null,
      Number(amountSat),
      createdBy ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function findTripWithDetailsById(tripId) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT t.*,
                v.plate AS vehicle_plate,
                v.name AS vehicle_name,
                d.code AS driver_code,
                d.name AS driver_name
         FROM trips t
         LEFT JOIN vehicles v ON v.id = t.vehicle_id
         LEFT JOIN employees d ON d.id = t.driver_id
         WHERE t.id = ?`,
      )
      .get(Number(tripId)) ?? null
  );
}

export function listTripLinkedExpenses(tripId, tripCode) {
  const db = getDb();
  return db
    .prepare(
      `SELECT e.*, u.username AS created_by_username, u.display_name AS created_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.ref_type = 'trip'
         AND (e.ref_id = ? OR e.ref_id = ?)
       ORDER BY e.date ASC, e.id ASC`,
    )
    .all(String(tripId), String(tripCode));
}
