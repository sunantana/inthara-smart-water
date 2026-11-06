import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createCustomerSchema,
  customerIdParamSchema,
  customersQuerySchema,
  customerSubresourceQuerySchema,
  resolveGmapsUrlSchema,
  updateCustomerPricesSchema,
  updateCustomerSchema,
} from './schema.js';
import * as service from './service.js';

const router = Router();

router.get(
  '/export',
  requireAuth,
  requireRole('manager', 'admin'),
  validate({ query: customersQuerySchema }),
  async (req, res, next) => {
    try {
      const buffer = await service.exportCustomersXlsxBuffer(req.query);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inthara-customers-${stamp}.xlsx"`,
      );
      return res.send(buffer);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/resolve-gmaps-url',
  requireAuth,
  requireRole(...ROLES),
  validate({ body: resolveGmapsUrlSchema }),
  async (req, res, next) => {
    try {
      const result = await service.resolveGoogleMapsUrl(req.body.url);
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
  validate({ query: customersQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listCustomers(req.query);
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
  validate({ params: customerIdParamSchema }),
  (req, res, next) => {
    try {
      const customer = service.getCustomerById(req.params.id);
      return res.json({
        ...customer,
        data: customer,
        customer,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id/orders',
  requireAuth,
  requireRole(...ROLES),
  validate({ params: customerIdParamSchema, query: customerSubresourceQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listCustomerOrders(req.params.id, req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id/ledger',
  requireAuth,
  requireRole('admin', 'manager', 'staff'),
  validate({ params: customerIdParamSchema, query: customerSubresourceQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listCustomerLedger(req.params.id, req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('CUSTOMER_CREATE', 'customers'),
  validate({ body: createCustomerSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const created = service.createCustomer(req.body, actorId);
      setAuditContext(res, {
        entityId: created.id,
        detail: `สร้างลูกค้า [${created.code}] ${created.name}`,
      });
      return res.status(201).json({
        ...created,
        data: created,
        customer: created,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('CUSTOMER_UPDATE', 'customers'),
  validate({ params: customerIdParamSchema, body: updateCustomerSchema }),
  (req, res, next) => {
    try {
      const updated = service.updateCustomer(req.params.id, req.body);
      setAuditContext(res, {
        entityId: updated.id,
        detail: `แก้ไขข้อมูลลูกค้า [${updated.code}] ${updated.name}`,
      });
      return res.json({
        ...updated,
        data: updated,
        customer: updated,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id/prices',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('CUSTOMER_PRICES_UPDATE', 'customer_prices'),
  validate({ params: customerIdParamSchema, body: updateCustomerPricesSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const updated = service.updateCustomerPrices(req.params.id, req.body.prices, actorId);
      setAuditContext(res, {
        entityId: updated.id,
        detail: `ปรับราคาเฉพาะรายของลูกค้า [${updated.code}] ${updated.name}`,
      });
      return res.json({
        ...updated,
        data: updated,
        customer: updated,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  audit('CUSTOMER_DELETE', 'customers'),
  validate({ params: customerIdParamSchema }),
  (req, res, next) => {
    try {
      const deleted = service.softDeleteCustomer(req.params.id);
      setAuditContext(res, {
        entityId: deleted.id,
        detail: `ระงับการใช้งานลูกค้า [${deleted.code}] ${deleted.name}`,
      });
      return res.json({
        ok: true,
        data: deleted,
        customer: deleted,
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
