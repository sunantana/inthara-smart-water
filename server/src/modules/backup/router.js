import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { restoreBackupSchema } from './schema.js';
import * as service from './service.js';

export const backupRouter = Router();

backupRouter.use(requireAuth);
backupRouter.use(requireRole('admin'));

/**
 * GET /api/backup/status (BKP-2)
 */
backupRouter.get('/status', (req, res, next) => {
  try {
    const result = service.getBackupStatus();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/backup/list (BKP-2)
 */
backupRouter.get('/list', (req, res, next) => {
  try {
    const result = service.listBackups();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/backup/run (BKP-1, BKP-2)
 */
backupRouter.post(
  '/run',
  audit('BACKUP_RUN', 'backup'),
  (req, res, next) => {
    try {
      const result = service.runBackup();
      setAuditContext(res, {
        entityId: result.filename,
        detail: `สำรองข้อมูลฐานข้อมูลสำเร็จ ไฟล์ ${result.filename} (${result.sizeFormatted})`,
      });
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * POST /api/backup/restore (BKP-2)
 */
backupRouter.post(
  '/restore',
  audit('BACKUP_RESTORE', 'backup'),
  validate({ body: restoreBackupSchema }),
  (req, res, next) => {
    try {
      const actorUsername = req.user?.username;
      const result = service.restoreBackup({
        filename: req.body.filename,
        adminPassword: req.body.adminPassword,
        actorUsername,
      });
      setAuditContext(res, {
        entityId: req.body.filename,
        detail: `คืนค่าฐานข้อมูลจากไฟล์ ${req.body.filename} สำเร็จ`,
      });
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

export default backupRouter;
