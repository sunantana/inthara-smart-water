import { getDb } from '../../db/connection.js';

const USER_FULL_COLUMNS = `
  id, username, display_name, role, password_hash, pin,
  employee_id, is_active, failed_attempts, lock_until, created_at, updated_at
`;

const USER_PUBLIC_COLUMNS = `
  id, username, display_name, role,
  employee_id, is_active, failed_attempts, lock_until, created_at, updated_at,
  CASE WHEN pin IS NOT NULL AND pin <> '' THEN 1 ELSE 0 END AS has_pin
`;

export function findByUsername(username) {
  return (
    getDb()
      .prepare(`SELECT ${USER_FULL_COLUMNS} FROM users WHERE username = ?`)
      .get(username) ?? null
  );
}

export function findById(id) {
  return (
    getDb()
      .prepare(`SELECT ${USER_FULL_COLUMNS} FROM users WHERE id = ?`)
      .get(id) ?? null
  );
}

export function findPublicById(id) {
  return (
    getDb()
      .prepare(`SELECT ${USER_PUBLIC_COLUMNS} FROM users WHERE id = ?`)
      .get(id) ?? null
  );
}

export function findEmployeeById(employeeId) {
  return (
    getDb()
      .prepare('SELECT id FROM employees WHERE id = ?')
      .get(employeeId) ?? null
  );
}

export function updateLoginAttempt(userId, failedAttempts, lockUntil) {
  getDb()
    .prepare(
      `UPDATE users
       SET failed_attempts = ?, lock_until = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(failedAttempts, lockUntil, userId);
}

export function resetUserLock(userId) {
  getDb()
    .prepare(
      `UPDATE users
       SET failed_attempts = 0, lock_until = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(userId);
  return findPublicById(userId);
}

export function updateUserPassword(userId, passwordHash) {
  getDb()
    .prepare(
      `UPDATE users
       SET password_hash = ?, failed_attempts = 0, lock_until = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(passwordHash, userId);
}

export function listUsers({ offset, limit, role, isActive, search }) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (role) {
    conditions.push('role = ?');
    params.push(role);
  }
  if (isActive !== undefined) {
    conditions.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }
  if (search) {
    conditions.push('(username LIKE ? OR display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM users ${whereClause}`)
    .get(...params);

  const rows = db
    .prepare(
      `SELECT ${USER_PUBLIC_COLUMNS}
       FROM users
       ${whereClause}
       ORDER BY id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total: totalRow?.total ?? 0 };
}

export function insertUser({
  username,
  displayName,
  role,
  passwordHash,
  pinHash,
  employeeId,
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO users (username, display_name, role, password_hash, pin, employee_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(
      username,
      displayName,
      role,
      passwordHash,
      pinHash ?? null,
      employeeId ?? null,
    );

  return findPublicById(Number(result.lastInsertRowid));
}

export function updateUserById(id, fields) {
  const sets = ["updated_at = datetime('now')"];
  const params = [];

  if (fields.displayName !== undefined) {
    sets.push('display_name = ?');
    params.push(fields.displayName);
  }
  if (fields.role !== undefined) {
    sets.push('role = ?');
    params.push(fields.role);
  }
  if (fields.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(fields.isActive ? 1 : 0);
  }
  if (fields.pinHash !== undefined) {
    sets.push('pin = ?');
    params.push(fields.pinHash);
  }
  if (fields.passwordHash !== undefined) {
    sets.push('password_hash = ?');
    params.push(fields.passwordHash);
  }
  if (fields.employeeId !== undefined) {
    sets.push('employee_id = ?');
    params.push(fields.employeeId);
  }

  params.push(id);
  getDb()
    .prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params);

  return findPublicById(id);
}

export function listAuditLogs({ offset, limit, username, action, fromDate, toDate }) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (username) {
    conditions.push('username LIKE ?');
    params.push(`%${username}%`);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (fromDate) {
    conditions.push('created_at >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    conditions.push('created_at <= ?');
    params.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`)
    .get(...params);

  const rows = db
    .prepare(
      `SELECT id, user_id, username, role, action, entity, entity_id, ip, status, detail, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total: totalRow?.total ?? 0 };
}

export default {
  findByUsername,
  findById,
  findPublicById,
  findEmployeeById,
  updateLoginAttempt,
  resetUserLock,
  updateUserPassword,
  listUsers,
  insertUser,
  updateUserById,
  listAuditLogs,
};
