import { getDb } from '../../db/connection.js';

export function getNextAssetSequence() {
  const db = getDb();
  const rows = db.prepare(`SELECT code FROM assets WHERE code LIKE 'AST-%'`).all();
  let maxNum = 0;
  for (const r of rows) {
    const match = String(r.code || '').match(/(\d+)$/);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return maxNum + 1;
}

export function findAssetById(id) {
  return (
    getDb()
      .prepare(
        `SELECT a.*,
                e.code AS assigned_employee_code,
                e.name AS assigned_employee_name,
                e.is_active AS assigned_employee_active
         FROM assets a
         LEFT JOIN employees e ON e.id = a.assigned_employee_id
         WHERE a.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function findAssetByCode(code) {
  return (
    getDb()
      .prepare(`SELECT * FROM assets WHERE code = ?`)
      .get(String(code || '').trim()) ?? null
  );
}

export function findEmployeeById(empId) {
  return (
    getDb()
      .prepare(`SELECT * FROM employees WHERE id = ?`)
      .get(Number(empId)) ?? null
  );
}

export function listAssets({ category = '', status = '', includeRetired = true } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (category) {
    clauses.push('a.category = ?');
    params.push(category);
  }
  if (status) {
    clauses.push('a.status = ?');
    params.push(status);
  } else if (!includeRetired) {
    clauses.push("a.status != 'retired'");
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT a.*,
              e.code AS assigned_employee_code,
              e.name AS assigned_employee_name,
              e.is_active AS assigned_employee_active
       FROM assets a
       LEFT JOIN employees e ON e.id = a.assigned_employee_id
       ${whereSql}
       ORDER BY a.id ASC`,
    )
    .all(...params);
}

export function insertAsset({
  code,
  name,
  category = 'general',
  categoryName = null,
  brand = null,
  model = null,
  serialNo = null,
  location = null,
  acquisitionDate = null,
  costSat = 0,
  usefulLifeYears = 5,
  salvageValueSat = 0,
  depreciationPerYearSat = 0,
  accumulatedDepSat = 0,
  assignedEmployeeId = null,
  status = 'in_use',
  isActive = 1,
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO assets (
         code, name, category, category_name, brand, model, serial_no, location,
         acquisition_date, cost_sat, useful_life_years, salvage_value_sat,
         depreciation_per_year_sat, accumulated_dep_sat, assigned_employee_id,
         status, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(
      code,
      name,
      category,
      categoryName ?? null,
      brand ?? null,
      model ?? null,
      serialNo ?? null,
      location ?? null,
      acquisitionDate ?? null,
      Number(costSat ?? 0),
      Number(usefulLifeYears ?? 5),
      Number(salvageValueSat ?? 0),
      Number(depreciationPerYearSat ?? 0),
      Number(accumulatedDepSat ?? 0),
      assignedEmployeeId ?? null,
      status,
      isActive ? 1 : 0,
    );
  return Number(res.lastInsertRowid);
}

export function updateAssetById(id, fields) {
  const db = getDb();
  const sets = [];
  const params = [];

  for (const [col, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${col} = ?`);
      params.push(val);
    }
  }
  sets.push("updated_at = datetime('now')");
  params.push(Number(id));

  db.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return findAssetById(id);
}
