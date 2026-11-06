import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { audit, setAuditContext } from '../../middleware/audit.js';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  tripCostingParamSchema,
} from './schema.js';
import { createExpense, getTripCosting, listExpenses } from './service.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/expenses/costing/trips/:tripId (EXP-2)
 */
router.get(
  '/costing/trips/:tripId',
  requireRole(...ROLES),
  validate({ params: tripCostingParamSchema }),
  (req, res, next) => {
    try {
      const result = getTripCosting(req.params.tripId);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/expenses (EXP-1)
 */
router.get(
  '/',
  requireRole(...ROLES),
  validate({ query: listExpensesQuerySchema }),
  (req, res, next) => {
    try {
      const result = listExpenses(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/expenses (EXP-1)
 */
router.post(
  '/',
  requireRole('admin', 'manager', 'staff'),
  audit('EXPENSE_CREATE', 'expenses'),
  validate({ body: createExpenseSchema }),
  (req, res, next) => {
    try {
      const created = createExpense(req.body, req.user);
      setAuditContext(res, {
        entityId: created.id,
        detail: `บันทึกค่าใช้จ่าย ${created.category} จำนวน ${created.amountSat} สตางค์`,
      });
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
