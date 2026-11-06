import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import * as repo from './repo.js';

const BCRYPT_COST = 10;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * เก็บสถานะ refresh token ที่ยังใช้งานได้ (jti → { userId, expiresAt })
 * เมื่อ refresh จะลบ jti เดิมออกแล้วออก jti ใหม่ทันที (rotation)
 * เมื่อ logout จะลบ jti ทิ้งทำให้นำกลับมาใช้ซ้ำไม่ได้
 * @type {Map<string, { userId: number, expiresAt: number }>}
 */
const activeRefreshTokens = new Map();

/**
 * เก็บตัวนับความพยายามล็อกอินผิดของชื่อผู้ใช้ที่ไม่มีอยู่ในฐานข้อมูล
 * เพื่อให้พฤติกรรมล็อก 5 ครั้ง / 15 นาทีเหมือนกันทุกกรณี และป้องกันการสุ่มเดาชื่อผู้ใช้
 * @type {Map<string, { failedAttempts: number, lockUntilMs: number | null }>}
 */
const unknownUserAttempts = new Map();

export function mapSessionUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
  };
}

export function mapUserDto(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    employeeId: row.employee_id ?? null,
    isActive: Boolean(row.is_active),
    failedAttempts: row.failed_attempts ?? 0,
    lockUntil: row.lock_until ?? null,
    hasPin: Boolean(row.has_pin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAuditLogDto(row) {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    username: row.username,
    role: row.role ?? null,
    action: row.action,
    entity: row.entity ?? null,
    entityId: row.entity_id ?? null,
    ip: row.ip ?? null,
    status: row.status,
    detail: row.detail ?? null,
    createdAt: row.created_at,
  };
}

export function hashSecret(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_COST);
}

export function signAccessToken(user) {
  const sessionUser = mapSessionUser(user);
  return jwt.sign(
    {
      sub: sessionUser.id,
      id: sessionUser.id,
      username: sessionUser.username,
      displayName: sessionUser.displayName,
      role: sessionUser.role,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl },
  );
}

export function signRefreshToken(user) {
  const sessionUser = mapSessionUser(user);
  const jti = crypto.randomUUID();
  const ttlMs = config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000;

  activeRefreshTokens.set(jti, {
    userId: sessionUser.id,
    expiresAt: Date.now() + ttlMs,
  });

  const token = jwt.sign(
    {
      sub: sessionUser.id,
      id: sessionUser.id,
      username: sessionUser.username,
      role: sessionUser.role,
      type: 'refresh',
      jti,
    },
    config.jwt.secret,
    { expiresIn: `${config.jwt.refreshTtlDays}d` },
  );

  return { token, jti, maxAgeMs: ttlMs };
}

export function revokeUserRefreshTokens(userId) {
  for (const [jti, meta] of activeRefreshTokens.entries()) {
    if (meta.userId === Number(userId)) {
      activeRefreshTokens.delete(jti);
    }
  }
}

function getRemainingLockMinutes(lockUntilValue) {
  if (!lockUntilValue) return 0;
  const lockUntilMs =
    typeof lockUntilValue === 'number' ? lockUntilValue : Date.parse(lockUntilValue);
  if (!Number.isFinite(lockUntilMs)) return 0;
  const diffMs = lockUntilMs - Date.now();
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

export function login({ username, password }) {
  const cleanUsername = username.trim();
  const user = repo.findByUsername(cleanUsername);

  if (!user) {
    const entry = unknownUserAttempts.get(cleanUsername);
    const lockMinutes = getRemainingLockMinutes(entry?.lockUntilMs);
    if (lockMinutes > 0) {
      throw AppError.accountLocked(lockMinutes);
    }

    const baseAttempts =
      entry?.lockUntilMs && entry.lockUntilMs <= Date.now() ? 0 : (entry?.failedAttempts ?? 0);
    const nextAttempts = baseAttempts + 1;
    const lockUntilMs =
      nextAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCK_DURATION_MS : null;

    unknownUserAttempts.set(cleanUsername, {
      failedAttempts: nextAttempts,
      lockUntilMs,
    });

    throw AppError.unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  const lockMinutes = getRemainingLockMinutes(user.lock_until);
  if (lockMinutes > 0) {
    throw AppError.accountLocked(lockMinutes);
  }

  if (!user.is_active) {
    throw AppError.unauthorized('บัญชีผู้ใช้นี้ถูกปิดการใช้งาน');
  }

  const passwordValid = bcrypt.compareSync(password, user.password_hash);
  if (!passwordValid) {
    const expiredLock = user.lock_until && Date.parse(user.lock_until) <= Date.now();
    const baseAttempts = expiredLock ? 0 : (user.failed_attempts ?? 0);
    const nextAttempts = baseAttempts + 1;
    const lockUntil =
      nextAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        : null;

    repo.updateLoginAttempt(user.id, nextAttempts, lockUntil);
    throw AppError.unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  if (user.failed_attempts > 0 || user.lock_until) {
    repo.resetUserLock(user.id);
  }
  unknownUserAttempts.delete(cleanUsername);

  const accessToken = signAccessToken(user);
  const refresh = signRefreshToken(user);

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshMaxAgeMs: refresh.maxAgeMs,
    user: mapSessionUser(user),
  };
}

export function refreshSession(refreshToken) {
  if (!refreshToken) {
    throw AppError.unauthorized('ไม่พบ refresh token กรุณาเข้าสู่ระบบใหม่');
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw AppError.tokenExpired();
    }
    throw AppError.unauthorized('refresh token ไม่ถูกต้อง');
  }

  if (!payload || typeof payload !== 'object' || payload.type !== 'refresh' || !payload.jti) {
    throw AppError.unauthorized('refresh token ไม่ถูกต้อง');
  }

  const sessionMeta = activeRefreshTokens.get(payload.jti);
  if (!sessionMeta || sessionMeta.expiresAt <= Date.now()) {
    activeRefreshTokens.delete(payload.jti);
    throw AppError.unauthorized('เซสชันหมดอายุหรือถูกยกเลิกไปแล้ว กรุณาเข้าสู่ระบบใหม่');
  }

  // หมุน token ทันที: ลบ jti เดิมก่อนออกใบใหม่
  activeRefreshTokens.delete(payload.jti);

  const user = repo.findById(Number(payload.sub));
  if (!user || !user.is_active) {
    throw AppError.unauthorized('บัญชีผู้ใช้นี้ไม่สามารถใช้งานได้');
  }

  const lockMinutes = getRemainingLockMinutes(user.lock_until);
  if (lockMinutes > 0) {
    throw AppError.accountLocked(lockMinutes);
  }

  const accessToken = signAccessToken(user);
  const nextRefresh = signRefreshToken(user);

  return {
    accessToken,
    refreshToken: nextRefresh.token,
    refreshMaxAgeMs: nextRefresh.maxAgeMs,
    user: mapSessionUser(user),
  };
}

export function logoutSession({ refreshToken, userId }) {
  let revokedUserId = userId ? Number(userId) : null;

  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.secret);
      if (payload && typeof payload === 'object') {
        if (payload.jti) activeRefreshTokens.delete(payload.jti);
        if (!revokedUserId && payload.sub) revokedUserId = Number(payload.sub);
      }
    } catch {
      // ถ้า refresh token หมดอายุหรือไม่ถูกต้อง ให้ข้ามไปล้างของ userId ถ้ารู้
    }
  }

  if (revokedUserId) {
    revokeUserRefreshTokens(revokedUserId);
  }
}

export function getCurrentUserProfile(userId) {
  const user = repo.findById(Number(userId));
  if (!user || !user.is_active) {
    throw AppError.unauthorized('ไม่พบข้อมูลผู้ใช้หรือบัญชีถูกระงับ');
  }
  return mapUserDto(user);
}

export function changePassword(userId, { oldPassword, pin, newPassword }) {
  const user = repo.findById(Number(userId));
  if (!user || !user.is_active) {
    throw AppError.unauthorized('ไม่พบข้อมูลผู้ใช้');
  }

  // AUTH-3: ต้องตรวจ PIN ยืนยันก่อนเปลี่ยนรหัสผ่าน
  if (!user.pin || !bcrypt.compareSync(String(pin), user.pin)) {
    throw AppError.unauthorized('รหัส PIN ยืนยันไม่ถูกต้อง');
  }

  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    throw AppError.unauthorized('รหัสผ่านเดิมไม่ถูกต้อง');
  }

  const passwordHash = hashSecret(newPassword);
  repo.updateUserPassword(user.id, passwordHash);

  return mapUserDto(repo.findPublicById(user.id));
}

export function listUsers(query) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;

  let isActive;
  if (query.active !== undefined) {
    isActive = query.active === '1' || query.active === 'true';
  }

  const { rows, total } = repo.listUsers({
    offset,
    limit,
    role: query.role,
    isActive,
    search: query.search,
  });

  return {
    data: rows.map(mapUserDto),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export function createUser(payload) {
  const cleanUsername = payload.username.trim();
  const existing = repo.findByUsername(cleanUsername);
  if (existing) {
    throw AppError.conflict('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว');
  }

  if (payload.employeeId != null) {
    const emp = repo.findEmployeeById(payload.employeeId);
    if (!emp) {
      throw AppError.badRequest('ไม่พบข้อมูลพนักงานที่ระบุ', [
        { field: 'body.employeeId', issue: 'ไม่พบรหัสพนักงาน' },
      ]);
    }
  }

  const passwordHash = hashSecret(payload.password);
  const pinHash = payload.pin ? hashSecret(payload.pin) : null;

  const created = repo.insertUser({
    username: cleanUsername,
    displayName: payload.displayName.trim(),
    role: payload.role,
    passwordHash,
    pinHash,
    employeeId: payload.employeeId ?? null,
  });

  return mapUserDto(created);
}

export function updateUser(id, payload) {
  const userId = Number(id);
  const existing = repo.findById(userId);
  if (!existing) {
    throw AppError.notFound('ไม่พบผู้ใช้ที่ต้องการแก้ไข');
  }

  if (payload.employeeId !== undefined && payload.employeeId !== null) {
    const emp = repo.findEmployeeById(payload.employeeId);
    if (!emp) {
      throw AppError.badRequest('ไม่พบข้อมูลพนักงานที่ระบุ', [
        { field: 'body.employeeId', issue: 'ไม่พบรหัสพนักงาน' },
      ]);
    }
  }

  const fields = {};
  if (payload.displayName !== undefined) fields.displayName = payload.displayName.trim();
  if (payload.role !== undefined) fields.role = payload.role;
  if (payload.isActive !== undefined) fields.isActive = payload.isActive;
  if (payload.pin !== undefined) fields.pinHash = hashSecret(payload.pin);
  if (payload.password !== undefined) fields.passwordHash = hashSecret(payload.password);
  if (payload.employeeId !== undefined) fields.employeeId = payload.employeeId;

  const updated = repo.updateUserById(userId, fields);

  if (payload.isActive === false) {
    revokeUserRefreshTokens(userId);
  }

  return mapUserDto(updated);
}

export function unlockUser(id) {
  const userId = Number(id);
  const existing = repo.findById(userId);
  if (!existing) {
    throw AppError.notFound('ไม่พบผู้ใช้ที่ต้องการปลดล็อก');
  }

  unknownUserAttempts.delete(existing.username);
  const unlocked = repo.resetUserLock(userId);
  return mapUserDto(unlocked);
}

function normalizeDateBound(value, isEnd) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isEnd ? `${trimmed} 23:59:59` : `${trimmed} 00:00:00`;
  }
  return trimmed.replace('T', ' ').replace(/Z$/, '');
}

export function listAuditLogs(query) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;

  const { rows, total } = repo.listAuditLogs({
    offset,
    limit,
    username: query.username || undefined,
    action: query.action || undefined,
    fromDate: normalizeDateBound(query.from, false),
    toDate: normalizeDateBound(query.to, true),
  });

  return {
    data: rows.map(mapAuditLogDto),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/** สำหรับล้างสถานะในหน่วยความจำระหว่างการรัน test */
export function resetAuthMemoryState() {
  activeRefreshTokens.clear();
  unknownUserAttempts.clear();
}

export default {
  login,
  refreshSession,
  logoutSession,
  getCurrentUserProfile,
  changePassword,
  listUsers,
  createUser,
  updateUser,
  unlockUser,
  listAuditLogs,
  hashSecret,
  signAccessToken,
  signRefreshToken,
  resetAuthMemoryState,
};
