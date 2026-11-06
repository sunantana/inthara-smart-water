import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createProductionLotSchema,
  evaluateProductionLotQaSchema,
  listProductionLotsQuerySchema,
  productionDashboardQuerySchema,
  productionLotIdParamSchema,
} from './schema.js';
import * as service from './service.js';

const STAFF_PLUS_ROLES = /** @type {const} */ (['admin', 'manager', 'staff']);

const router = Router();

router.get(
  '/lots',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: listProductionLotsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listProductionLots(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/lots',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('PRODUCTION_LOT_CREATE', 'production_lots'),
  validate({ body: createProductionLotSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const lot = service.createProductionLot(req.body, actorId);
      setAuditContext(res, {
        entityId: String(lot.id),
        detail: `บันทึกล็อตผลิต ${lot.lotNo} (${lot.productionDate}, กะ=${lot.shift}, ผลิตจริง 18.9L=${lot.actual['FG-189L']})`,
      });
      return res.status(201).json(lot);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/lots/:id/qa',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('PRODUCTION_LOT_QA', 'production_lots'),
  validate({ params: productionLotIdParamSchema, body: evaluateProductionLotQaSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const result = service.evaluateProductionLotQa(req.params.id, req.body, actorId);
      setAuditContext(res, {
        entityId: String(result.id),
        detail: `ตรวจรับ QA ล็อตผลิต ${result.lotNo}: ${result.qaPassed ? 'ผ่านเกณฑ์ (รับ FG เข้าสต็อก + ตัดบรรจุภัณฑ์ FIFO)' : 'ไม่ผ่านเกณฑ์'}`,
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/dashboard',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: productionDashboardQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.getProductionDashboard(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
