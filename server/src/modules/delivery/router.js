import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  checkinIdParamSchema,
  checkinsQuerySchema,
  createCheckinSchema,
} from './schema.js';
import * as service from './service.js';

const router = Router();

router.get(
  '/slip/:checkinId',
  requireAuth,
  requireRole(...ROLES),
  validate({ params: checkinIdParamSchema }),
  (req, res, next) => {
    try {
      const slip = service.getCheckinSlip(req.params.checkinId);
      return res.json(slip);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: checkinsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listCheckins(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES),
  audit('CHECKIN_CREATE', 'checkins'),
  validate({ body: createCheckinSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const result = service.createCheckin(req.body, actorId);

      setAuditContext(res, {
        entityId: String(result.checkin.id),
        detail: `เช็คอินส่งน้ำออเดอร์ ${result.order.code} (${result.checkin.paymentMode}, ยอดรับ=${result.checkin.moneyReceivedSat} สต., คืนถัง=${result.checkin.returned189L})`,
      });

      return res.status(201).json({
        ...result,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
