import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { extractBearerToken } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/errors.js';
import {
  adminPortalPinBodySchema,
  customerIdParamSchema,
  portalCreateOrderSchema,
  portalLoginBodySchema,
  portalOrdersQuerySchema,
} from './schema.js';
import * as service from './service.js';

export const portalRouter = Router();

/**
 * middleware: ตรวจสอบ Access Token สำหรับพอร์ทัลลูกค้าโดยเฉพาะ (scope: 'portal')
 * - ถ้าไม่มี token -> 401 UNAUTHORIZED
 * - ถ้าเป็น token ของ staff (scope !== 'portal') -> 403 FORBIDDEN (ISOLATION)
 */
export function requirePortalAuth(req, _res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(AppError.unauthorized('กรุณาเข้าสู่ระบบพอร์ทัลลูกค้า'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (!payload || typeof payload !== 'object') {
      throw AppError.unauthorized('token พอร์ทัลไม่ถูกต้อง');
    }

    if (payload.scope !== 'portal') {
      throw AppError.forbidden(
        'token นี้ไม่ใช่ของพอร์ทัลลูกค้า (token พนักงานเข้าใช้งานพอร์ทัลไม่ได้)',
      );
    }

    req.portalUser = payload;
    req.portalCustomerId = Number(payload.customerId || payload.sub);
    return next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    if (error.name === 'TokenExpiredError') {
      return next(AppError.tokenExpired('เซสชันพอร์ทัลหมดอายุ กรุณาเข้าสู่ระบบใหม่'));
    }
    return next(AppError.unauthorized('token พอร์ทัลไม่ถูกต้อง'));
  }
}

/**
 * POST /api/portal/login (PORTAL-1, PORTAL-2)
 * Rate limit 5 ครั้งต่อ 15 นาทีต่อ IP
 */
portalRouter.post(
  '/login',
  service.portalRateLimiter,
  validate({ body: portalLoginBodySchema }),
  (req, res, next) => {
    try {
      const result = service.loginPortal(req.body);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/portal/me (PORTAL-3)
 */
portalRouter.get('/me', requirePortalAuth, (req, res, next) => {
  try {
    const result = service.getPortalMe(req.portalCustomerId);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/portal/orders (PORTAL-4)
 */
portalRouter.post(
  '/orders',
  requirePortalAuth,
  validate({ body: portalCreateOrderSchema }),
  (req, res, next) => {
    try {
      const order = service.createPortalOrder(req.portalCustomerId, req.body);
      return res.status(201).json({
        ...order,
        data: order,
        order,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/portal/my/orders (PORTAL-3)
 */
portalRouter.get(
  '/my/orders',
  requirePortalAuth,
  validate({ query: portalOrdersQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listMyPortalOrders(req.portalCustomerId, req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

export default portalRouter;
