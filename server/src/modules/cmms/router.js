import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createMaintenanceLogBodySchema,
  listMaintenanceLogsQuerySchema,
  machineCodeParamSchema,
  updateMachineRunHoursBodySchema,
  updateMachineStatusBodySchema,
} from './schema.js';
import * as service from './service.js';

export const machinesRouter = Router();
export const maintenanceRouter = Router();

machinesRouter.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  (_req, res, next) => {
    try {
      const result = service.listMachines();
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

machinesRouter.get(
  '/due-pm',
  requireAuth,
  requireRole(...ROLES),
  (_req, res, next) => {
    try {
      const result = service.listDuePmMachines();
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

machinesRouter.put(
  '/:code/status',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('MACHINE_STATUS_UPDATE', 'machines'),
  validate({ params: machineCodeParamSchema, body: updateMachineStatusBodySchema }),
  (req, res, next) => {
    try {
      const updated = service.updateMachineStatus(req.params.code, req.body);
      setAuditContext(res, {
        entityId: updated.code,
        detail: `เปลี่ยนสถานะเครื่องจักร ${updated.code} เป็น ${updated.status} (ซิงค์ asset=${updated.linkedAssetId ?? '-'})`,
      });
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },
);

machinesRouter.put(
  '/:code/hours',
  requireAuth,
  requireRole('manager', 'admin', 'staff'),
  audit('MACHINE_HOURS_UPDATE', 'machines'),
  validate({ params: machineCodeParamSchema, body: updateMachineRunHoursBodySchema }),
  (req, res, next) => {
    try {
      const updated = service.updateMachineRunHours(req.params.code, req.body);
      setAuditContext(res, {
        entityId: updated.code,
        detail: `อัปเดตชั่วโมงรันเครื่องจักร ${updated.code}: ${updated.runHours} ชม.`,
      });
      return res.json(updated);
    } catch (error) {
      return next(error);
    }
  },
);

maintenanceRouter.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: listMaintenanceLogsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listMaintenanceLogs(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

maintenanceRouter.post(
  '/',
  requireAuth,
  requireRole('manager', 'admin', 'staff'),
  audit('MAINTENANCE_LOG_CREATE', 'maintenance_logs'),
  validate({ body: createMaintenanceLogBodySchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const result = service.createMaintenanceLog(req.body, actorId);
      setAuditContext(res, {
        entityId: String(result.id),
        detail: `บันทึกงานซ่อม/PM เครื่อง ${result.machineCode} (${result.type}, อะไหล่=${result.spareSku ?? '-'} x${result.spareQty ?? 0})`,
      });
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

export default {
  machinesRouter,
  maintenanceRouter,
};
