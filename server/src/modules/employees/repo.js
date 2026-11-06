import { getDb } from '../../db/connection.js';

export function getNextEmployeeSequence() {
  const db = getDb();
  const rows = db.prepare(`SELECT code FROM employees WHERE code LIKE 'EMP-%'`).all();
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

export function listEmployees({ isActive, department = '' } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (isActive !== undefined && isActive !== null) {
    clauses.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }
  if (department) {
    clauses.push('department = ?');
    params.push(department);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT *
       FROM employees
       ${whereSql}
       ORDER BY id ASC`,
    )
    .all(...params);
}

export function findEmployeeById(id) {
  return (
    getDb()
      .prepare(`SELECT * FROM employees WHERE id = ?`)
      .get(Number(id)) ?? null
  );
}

export function findEmployeeByCode(code) {
  return (
    getDb()
      .prepare(`SELECT * FROM employees WHERE code = ?`)
      .get(String(code || '').trim()) ?? null
  );
}

export function insertEmployee({
  code,
  name,
  nickname = null,
  gender = null,
  position = null,
  department = null,
  phone = null,
  idCard = null,
  startDate = null,
  salaryType = 'monthly',
  salarySat = 0,
  driverLicense = null,
  driverLicenseExpiry = null,
  username = null,
  isActive = 1,
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO employees (
         code, name, nickname, gender, position, department, phone, id_card,
         start_date, salary_type, salary_sat, driver_license, driver_license_expiry,
         username, is_active, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(
      code,
      name,
      nickname ?? null,
      gender ?? null,
      position ?? null,
      department ?? null,
      phone ?? null,
      idCard ?? null,
      startDate ?? null,
      salaryType ?? 'monthly',
      Number(salarySat ?? 0),
      driverLicense ?? null,
      driverLicenseExpiry ?? null,
      username ?? null,
      isActive ? 1 : 0,
    );
  return Number(res.lastInsertRowid);
}

export function updateEmployeeById(id, fields) {
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

  db.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return findEmployeeById(id);
}
