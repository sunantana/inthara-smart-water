import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createEmployeeBodySchema,
  employeeIdParamSchema,
  licenseExpiringQuerySchema,
  listEmployeesQuerySchema,
  updateEmployeeBodySchema,
} from './schema.js';
import * as service from './service.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: listEmployeesQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listEmployees(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/license-expiring',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: licenseExpiringQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listLicenseExpiringEmployees(req.query);
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
  validate({ params: employeeIdParamSchema }),
  (req, res, next) => {
    try {
      const result = service.getEmployeeById(req.params.id);
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
  audit('EMPLOYEE_CREATE', 'employees'),
  validate({ body: createEmployeeBodySchema }),
  (req, res, next) => {
    try {
      const created = service.createEmployee(req.body);
      setAuditContext(res, {
        entityId: String(created.id),
        detail: `เพิ่มพนักงาน ${created.code} (${created.name})`,
      });
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('EMPLOYEE_UPDATE', 'employees'),
  validate({ params: employeeIdParamSchema, body: updateEmployeeBodySchema }),
  (req, res, next) => {
    try {
      const updated = service.updateEmployee(req.params.id, req.body);
      setAuditContext(res, {
        entityId: String(updated.id),
        detail: `แก้ไขข้อมูลพนักงาน ${updated.code} (isActive=${updated.isActive})`,
      });
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin', 'manager'),
  audit('EMPLOYEE_DEACTIVATE', 'employees'),
  validate({ params: employeeIdParamSchema }),
  (req, res, next) => {
    try {
      const deactivated = service.deactivateEmployee(req.params.id);
      setAuditContext(res, {
        entityId: String(deactivated.id),
        detail: `ปิดสถานะพนักงาน ${deactivated.code} (is_active=0)`,
      });
      return res.json(deactivated);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
