import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

/**
 * ดึง Bearer token จาก header
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * ตรวจ access token ของพนักงาน (scope ต้องไม่ใช่ portal)
 * @param {string} token
 * @returns {{ sub: number|string, username: string, role: string, scope?: string }}
 */
export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (!payload || typeof payload !== 'object') throw new Error('invalid payload');
    if (payload.scope === 'portal') {
      throw new AppError(401, 'UNAUTHORIZED', 'token นี้เป็นของพอร์ทัลลูกค้า ใช้กับ API พนักงานไม่ได้');
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TokenExpiredError') throw AppError.tokenExpired();
    throw AppError.unauthorized('token ไม่ถูกต้อง');
  }
}

/**
 * middleware: บังคับล็อกอิน — ใส่ req.user เมื่อ token ถูกต้อง
 */
export function requireAuth(req, _res, next) {
  const token = extractBearerToken(req);
  if (!token) return next(AppError.unauthorized());

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * middleware: ถ้ามี token ที่ถูกต้องก็ใส่ req.user ถ้าไม่มี/ผิดก็ปล่อยผ่านแบบไม่ล็อกอิน
 * (ใช้กับ endpoint ที่แสดงผลต่างกันตามสิทธิ์)
 */
export function optionalAuth(req, _res, next) {
  const token = extractBearerToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      req.user = undefined;
    }
  }
  return next();
}

export default { requireAuth, optionalAuth, verifyAccessToken, extractBearerToken };
