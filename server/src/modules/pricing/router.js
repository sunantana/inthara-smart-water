import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createPriceTierSchema,
  priceTierIdParamSchema,
  priceTiersQuerySchema,
  updatePriceTierSchema,
} from './schema.js';
import * as service from './service.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: priceTiersQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listPriceTiers(req.query);
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
  audit('PRICE_TIER_CREATE', 'price_tiers'),
  validate({ body: createPriceTierSchema }),
  (req, res, next) => {
    try {
      const created = service.createPriceTier(req.body);
      setAuditContext(res, {
        entityId: created.id,
        detail: `สร้าง Price Tier "${created.name}"`,
      });
      return res.status(201).json({ data: created, priceTier: created });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('PRICE_TIER_UPDATE', 'price_tiers'),
  validate({ params: priceTierIdParamSchema, body: updatePriceTierSchema }),
  (req, res, next) => {
    try {
      const updated = service.updatePriceTier(req.params.id, req.body);
      setAuditContext(res, {
        entityId: updated.id,
        detail: `แก้ไข Price Tier "${updated.name}"`,
      });
      return res.json({ data: updated, priceTier: updated });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  audit('PRICE_TIER_DELETE', 'price_tiers'),
  validate({ params: priceTierIdParamSchema }),
  (req, res, next) => {
    try {
      const result = service.deletePriceTier(req.params.id);
      setAuditContext(res, {
        entityId: result.id,
        detail: `ลบ Price Tier #${result.id}`,
      });
      return res.json({ ok: true, data: result });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
