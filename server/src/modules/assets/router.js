import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  assetDepreciationQuerySchema,
  assetIdParamSchema,
  createAssetBodySchema,
  listAssetsQuerySchema,
  updateAssetBodySchema,
} from './schema.js';
import * as service from './service.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: listAssetsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listAssets(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id/depreciation',
  requireAuth,
  requireRole(...ROLES),
  validate({ params: assetIdParamSchema, query: assetDepreciationQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.getAssetDepreciation(req.params.id, req.query);
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
  validate({ params: assetIdParamSchema }),
  (req, res, next) => {
    try {
      const result = service.getAssetById(req.params.id);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'manager'),
  audit('ASSET_CREATE', 'assets'),
  validate({ body: createAssetBodySchema }),
  (req, res, next) => {
    try {
      const created = service.createAsset(req.body);
      setAuditContext(res, {
        entityId: String(created.id),
        detail: `ขึ้นทะเบียนสินทรัพย์ ${created.code} (${created.name}, ราคาทุน=${created.costSat} สต.)`,
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
  requireRole('admin', 'manager'),
  audit('ASSET_UPDATE', 'assets'),
  validate({ params: assetIdParamSchema, body: updateAssetBodySchema }),
  (req, res, next) => {
    try {
      const updated = service.updateAsset(req.params.id, req.body);
      setAuditContext(res, {
        entityId: String(updated.id),
        detail: `แก้ไขสินทรัพย์ ${updated.code} (status=${updated.status})`,
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
  audit('ASSET_RETIRE', 'assets'),
  validate({ params: assetIdParamSchema }),
  (req, res, next) => {
    try {
      const retired = service.retireAsset(req.params.id);
      setAuditContext(res, {
        entityId: String(retired.id),
        detail: `ปลดระวางสินทรัพย์ ${retired.code} (status=retired, is_active=0)`,
      });
      return res.json(retired);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
