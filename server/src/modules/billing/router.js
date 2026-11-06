import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  billingCustomerIdParamSchema,
  billingSettleSchema,
  billingUnpaidQuerySchema,
  receiptIdParamSchema,
} from './schema.js';
import * as service from './service.js';

const STAFF_PLUS_ROLES = /** @type {const} */ (['admin', 'manager', 'staff']);

const router = Router();

router.get(
  '/unpaid',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  validate({ query: billingUnpaidQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listUnpaidBilling(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/settle',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('BILLING_SETTLE', 'payment_receipts'),
  validate({ body: billingSettleSchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const result = service.settleCustomerDebt(req.body, actorId);

      setAuditContext(res, {
        entityId: String(result.receipt.id),
        detail: `ปิดบิลลูกค้า #${result.customerBalance.customerId} (${result.receipt.code}, รับเงิน=${result.receipt.amountSat} สต., ใช้มัดจำ=${result.customerBalance.usedDepositSat} สต., ปิดออเดอร์=${result.settledOrders.length} รายการ)`,
      });

      return res.json({
        ...result,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/slip/:receiptId',
  requireAuth,
  requireRole(...ROLES),
  validate({ params: receiptIdParamSchema }),
  (req, res, next) => {
    try {
      const slip = service.getReceiptSlip(req.params.receiptId);
      return res.json(slip);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/history-slip/:customerId',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  validate({ params: billingCustomerIdParamSchema }),
  (req, res, next) => {
    try {
      const slip = service.getCustomerHistorySlip(req.params.customerId);
      return res.json(slip);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
