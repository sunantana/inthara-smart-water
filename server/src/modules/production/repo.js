import { getDb } from '../../db/connection.js';

export function runInTransaction(fn) {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx();
}

export function listExistingLotNosByPrefix(prefix) {
  const db = getDb();
  return db
    .prepare(`SELECT lot_no FROM production_lots WHERE lot_no LIKE ? ORDER BY id ASC`)
    .all(`${prefix}%`)
    .map((r) => r.lot_no);
}

export function insertProductionLot({
  lotNo,
  productionDate,
  shift,
  planJson,
  actualJson,
  tdsRaw = null,
  tdsRo = null,
  ph = null,
  qaPassed = null,
  notes = null,
  createdBy = null,
}) {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO production_lots (
         lot_no, production_date, shift, plan_json, actual_json,
         tds_raw, tds_ro, ph, qa_passed, notes, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      lotNo,
      productionDate,
      shift,
      planJson,
      actualJson,
      tdsRaw ?? null,
      tdsRo ?? null,
      ph ?? null,
      qaPassed,
      notes ?? null,
      createdBy ?? null,
    );
  return Number(res.lastInsertRowid);
}

export function findProductionLotById(id) {
  const db = getDb();
  return (
    db
      .prepare(
        `SELECT pl.*,
                u.display_name AS created_by_name
         FROM production_lots pl
         LEFT JOIN users u ON u.id = pl.created_by
         WHERE pl.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function updateProductionLotQa(
  id,
  { qaPassed, tdsRaw, tdsRo, ph, notes },
) {
  const db = getDb();
  return db
    .prepare(
      `UPDATE production_lots
       SET qa_passed = ?,
           tds_raw = COALESCE(?, tds_raw),
           tds_ro = COALESCE(?, tds_ro),
           ph = COALESCE(?, ph),
           notes = COALESCE(?, notes)
       WHERE id = ?`,
    )
    .run(
      qaPassed,
      tdsRaw !== undefined ? tdsRaw : null,
      tdsRo !== undefined ? tdsRo : null,
      ph !== undefined ? ph : null,
      notes !== undefined ? notes : null,
      Number(id),
    );
}

export function listProductionLots({
  offset = 0,
  limit = 50,
  dateFrom = '',
  dateTo = '',
  shift = '',
} = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (dateFrom) {
    clauses.push('pl.production_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('pl.production_date <= ?');
    params.push(dateTo);
  }
  if (shift) {
    clauses.push('pl.shift = ?');
    params.push(shift);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM production_lots pl ${whereSql}`)
    .get(...params);
  const total = Number(totalRow?.cnt ?? 0);

  const rows = db
    .prepare(
      `SELECT pl.*,
              u.display_name AS created_by_name
       FROM production_lots pl
       LEFT JOIN users u ON u.id = pl.created_by
       ${whereSql}
       ORDER BY pl.production_date DESC, pl.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total };
}

export function listProductionLotsForDashboard({ dateFrom = '', dateTo = '' } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (dateFrom) {
    clauses.push('production_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('production_date <= ?');
    params.push(dateTo);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT *
       FROM production_lots
       ${whereSql}
       ORDER BY production_date ASC, shift ASC, id ASC`,
    )
    .all(...params);
}
