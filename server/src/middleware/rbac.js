import { AppError } from '../utils/errors.js';

/** บทบาททั้งหมดตาม 03 (users.role CHECK) */
export const ROLES = Object.freeze(['admin', 'manager', 'staff', 'driver']);

/**
 * middleware: ต้องมี req.user และบทบาทตรงกับที่อนุญาต
 * ใช้หลัง requireAuth เสมอ — server ต้องเช็คสิทธิ์จริงทุกครั้ง ไม่พึ่งการซ่อนเมนูฝั่ง client
 * @param {...string} allowedRoles
 */
export function requireRole(...allowedRoles) {
  const allowed = allowedRoles.flat();
  const invalid = allowed.filter((role) => !ROLES.includes(role));
  if (allowed.length === 0 || invalid.length > 0) {
    throw new Error(`requireRole: ระบุบทบาทไม่ถูกต้อง (${invalid.join(', ') || 'ว่าง'})`);
  }

  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowed.includes(req.user.role)) return next(AppError.forbidden());
    return next();
  };
}

/** ตัวช่วยอ่านใน service: ผู้ใช้เป็น admin หรือ manager หรือไม่ */
export function isManagerOrAdmin(user) {
  return Boolean(user) && (user.role === 'admin' || user.role === 'manager');
}

export default { requireRole, isManagerOrAdmin, ROLES };
