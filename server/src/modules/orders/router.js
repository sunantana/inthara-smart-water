import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  cancelOrderSchema,
  createOrderSchema,
  orderIdParamSchema,
  ordersQuerySchema,
  routeSheetQuerySchema,
  updateOrderSchema,
} from './schema.js';
import * as service from './service.js';

const STAFF_PLUS_ROLES = /** @type {const} */ (['admin', 'manager', 'staff']);

const router = Router();

router.get(
  '/export',
  requireAuth,
  requireRole('manager', 'admin'),
  validate({ query: ordersQuerySchema }),
  async (req, res, next) => {
    try {
      const buffer = await service.exportOrdersXlsxBuffer(req.query);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="inthara-orders-${stamp}.xlsx"`);
      return res.send(buffer);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/route-sheet',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: routeSheetQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.getRouteSheet(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: ordersQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listOrders(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id',
  requireAuth,
  requireRole(...ROLES),
  validate({ params: orderIdParamSchema }),
  (req, res, next) => {
    try {
      const order = service.getOrderById(req.params.id);
      return res.json({
        ...order,
        data: order,
        order,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('ORDER_CREATE', 'orders'),
  validate({ body: createOrderSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const { order, duplicateIgnored } = service.createOrder(req.body, actorId);

      setAuditContext(res, {
        entityId: order.id,
        detail: duplicateIgnored
          ? `ข้ามการสร้างออเดอร์ซ้ำภายใน 4 วินาที [${order.code}]`
          : `สร้างออเดอร์ [${order.code}] ลูกค้า ${order.customerName} ยอด ${order.totalSat} satang`,
      });

      if (duplicateIgnored) {
        return res.status(200).json({
          data: order,
          order,
          duplicateIgnored: true,
        });
      }

      return res.status(201).json({
        ...order,
        data: order,
        order,
        duplicateIgnored: false,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('ORDER_UPDATE', 'orders'),
  validate({ params: orderIdParamSchema, body: updateOrderSchema }),
  (req, res, next) => {
    try {
      const updated = service.updateOrder(req.params.id, req.body);
      setAuditContext(res, {
        entityId: updated.id,
        detail: `แก้ไขออเดอร์ [${updated.code}] ยอดรวม ${updated.totalSat} satang`,
      });
      return res.json({
        ...updated,
        data: updated,
        order: updated,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/:id/confirm',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('ORDER_CONFIRM', 'orders'),
  validate({ params: orderIdParamSchema }),
  (req, res, next) => {
    try {
      const confirmed = service.confirmOrder(req.params.id);
      setAuditContext(res, {
        entityId: confirmed.id,
        detail: `ยืนยันออเดอร์ [${confirmed.code}]`,
      });
      return res.json({
        ...confirmed,
        data: confirmed,
        order: confirmed,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/:id/cancel',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('ORDER_CANCEL', 'orders'),
  validate({ params: orderIdParamSchema, body: cancelOrderSchema }),
  (req, res, next) => {
    try {
      const cancelled = service.cancelOrder(req.params.id, req.body);
      setAuditContext(res, {
        entityId: cancelled.id,
        detail: `ยกเลิกออเดอร์ [${cancelled.code}]`,
      });
      return res.json({
        ...cancelled,
        data: cancelled,
        order: cancelled,
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
