import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { salesReportQuerySchema } from './schema.js';
import * as service from './service.js';

export const reportsRouter = Router();

/**
 * GET /api/reports/dashboard (RPT-1, RPT-3)
 * รวมการเตือนทุกชนิดใน response เดียว + กราฟแนวโน้มยอดขาย 12 เดือน
 */
reportsRouter.get(
  '/dashboard',
  requireAuth,
  requireRole(...ROLES),
  (req, res, next) => {
    try {
      const asOf = typeof req.query?.asOf === 'string' ? req.query.asOf : undefined;
      const result = service.getDashboardSummary(asOf);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/reports/sales?dateFrom&dateTo&zone&groupBy=day|month (RPT-2)
 */
reportsRouter.get(
  '/sales',
  requireAuth,
  requireRole('admin', 'manager', 'staff'),
  validate({ query: salesReportQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.getSalesReport(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * GET /api/reports/sales/export (RPT-2 Excel Export)
 */
reportsRouter.get(
  '/sales/export',
  requireAuth,
  requireRole('admin', 'manager'),
  validate({ query: salesReportQuerySchema }),
  async (req, res, next) => {
    try {
      const buffer = await service.exportSalesReportXlsxBuffer(req.query);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inthara-sales-report-${stamp}.xlsx"`,
      );
      return res.send(buffer);
    } catch (error) {
      return next(error);
    }
  },
);

export default reportsRouter;
