import { Router } from 'express';
import { config } from '../../config.js';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/errors.js';
import {
  auditLogsQuerySchema,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  updateUserSchema,
  userIdParamSchema,
  usersQuerySchema,
} from './schema.js';
import * as service from './service.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';
const LOGIN_RATE_LIMIT_MAX = 10;
const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** @type {Map<string, { count: number, resetAt: number }>} */
const loginRateWindow = new Map();

export function resetLoginRateLimiter() {
  loginRateWindow.clear();
}

export function loginRateLimiter(req, _res, next) {
  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const current = loginRateWindow.get(ip);

  if (!current || current.resetAt <= now) {
    loginRateWindow.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  current.count += 1;
  if (current.count > LOGIN_RATE_LIMIT_MAX) {
    return next(
      AppError.tooManyRequests('พยายามเข้าสู่ระบบถี่เกินไป กรุณารอ 1 นาทีแล้วลองใหม่อีกครั้ง'),
    );
  }

  return next();
}

export function extractRefreshCookie(req) {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return null;

  for (const part of rawCookie.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === REFRESH_COOKIE_NAME) {
      const value = rest.join('=').trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function setRefreshCookie(res, token, maxAgeMs) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: maxAgeMs,
    path: '/',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
  });
}

const router = Router();

router.post(
  '/login',
  loginRateLimiter,
  audit('LOGIN_SUCCESS', 'auth'),
  validate({ body: loginSchema }),
  (req, res, next) => {
    try {
      const result = service.login(req.body);
      req.user = result.user;
      setAuditContext(res, {
        userId: result.user.id,
        username: result.user.username,
        role: result.user.role,
        action: 'LOGIN_SUCCESS',
        entityId: result.user.id,
        detail: 'เข้าสู่ระบบสำเร็จ',
      });
      setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeMs);
      return res.json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (error) {
      setAuditContext(res, {
        username: req.body?.username,
        action: 'LOGIN_FAILED',
        detail: error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ',
      });
      return next(error);
    }
  },
);

router.post('/refresh', audit('TOKEN_REFRESH', 'auth'), (req, res, next) => {
  try {
    const token = extractRefreshCookie(req);
    const result = service.refreshSession(token);
    req.user = result.user;
    setAuditContext(res, {
      userId: result.user.id,
      username: result.user.username,
      role: result.user.role,
      entityId: result.user.id,
      detail: 'หมุน refresh token สำเร็จ',
    });
    setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeMs);
    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', optionalAuth, audit('LOGOUT', 'auth'), (req, res, next) => {
  try {
    const refreshToken = extractRefreshCookie(req);
    if (!req.user && !refreshToken) {
      return next(AppError.unauthorized());
    }

    service.logoutSession({
      refreshToken,
      userId: req.user?.id ?? req.user?.sub,
    });
    clearRefreshCookie(res);

    setAuditContext(res, {
      userId: req.user?.id ?? req.user?.sub ?? null,
      username: req.user?.username ?? 'session',
      role: req.user?.role ?? null,
      entityId: req.user?.id ?? req.user?.sub ?? '',
      detail: 'ออกจากระบบสำเร็จ',
    });

    return res.json({ ok: true, message: 'ออกจากระบบสำเร็จ' });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', requireAuth, requireRole(...ROLES), (req, res, next) => {
  try {
    const profile = service.getCurrentUserProfile(req.user.id ?? req.user.sub);
    return res.json({
      ...profile,
      user: profile,
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/change-password',
  requireAuth,
  requireRole(...ROLES),
  audit('CHANGE_PASSWORD', 'users'),
  validate({ body: changePasswordSchema }),
  (req, res, next) => {
    try {
      const userId = req.user.id ?? req.user.sub;
      const updated = service.changePassword(userId, req.body);
      setAuditContext(res, {
        entityId: updated.id,
        detail: `ผู้ใช้ ${updated.username} เปลี่ยนรหัสผ่านด้วย PIN ยืนยัน`,
      });
      return res.json({ ok: true, user: updated });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/users',
  requireAuth,
  requireRole('admin'),
  validate({ query: usersQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listUsers(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/users',
  requireAuth,
  requireRole('admin'),
  audit('USER_CREATE', 'users'),
  validate({ body: createUserSchema }),
  (req, res, next) => {
    try {
      const created = service.createUser(req.body);
      setAuditContext(res, {
        entityId: created.id,
        detail: `สร้างผู้ใช้ ${created.username} (${created.role})`,
      });
      return res.status(201).json({ data: created, user: created });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/users/:id',
  requireAuth,
  requireRole('admin'),
  audit('USER_UPDATE', 'users'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  (req, res, next) => {
    try {
      const updated = service.updateUser(req.params.id, req.body);
      setAuditContext(res, {
        entityId: updated.id,
        detail: `แก้ไขผู้ใช้ ${updated.username}`,
      });
      return res.json({ data: updated, user: updated });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/users/:id/unlock',
  requireAuth,
  requireRole('admin'),
  audit('USER_UNLOCK', 'users'),
  validate({ params: userIdParamSchema }),
  (req, res, next) => {
    try {
      const unlocked = service.unlockUser(req.params.id);
      setAuditContext(res, {
        entityId: unlocked.id,
        detail: `ปลดล็อกบัญชี ${unlocked.username}`,
      });
      return res.json({ data: unlocked, user: unlocked });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/audit-logs',
  requireAuth,
  requireRole('admin', 'manager'),
  validate({ query: auditLogsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listAuditLogs(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
