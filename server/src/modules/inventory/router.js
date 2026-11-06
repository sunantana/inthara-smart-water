import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  adjustInventorySchema,
  inventoryItemsQuerySchema,
  inventoryMovementsQuerySchema,
  inventorySkuParamSchema,
  updateInventoryItemSchema,
} from './schema.js';
import * as service from './service.js';

const router = Router();

router.get(
  '/items',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: inventoryItemsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listInventoryItems(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/items/:sku',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('INVENTORY_ITEM_UPDATE', 'inventory_items'),
  validate({ params: inventorySkuParamSchema, body: updateInventoryItemSchema }),
  (req, res, next) => {
    try {
      const item = service.updateInventoryItem(req.params.sku, req.body);
      setAuditContext(res, {
        entityId: item.sku,
        detail: `อัปเดตข้อมูลสินค้า ${item.sku} (min_stock=${item.minStock})`,
      });
      return res.json({
        ...item,
        data: item,
        item,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/movements',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: inventoryMovementsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listStockMovements(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/adjust',
  requireAuth,
  requireRole('manager', 'admin'),
  audit('INVENTORY_ADJUST', 'inventory_items'),
  validate({ body: adjustInventorySchema }),
  (req, res, next) => {
    try {
      const actorId = req.user?.id ?? req.user?.sub ?? null;
      const result = service.adjustInventoryStock(req.body, actorId);
      setAuditContext(res, {
        entityId: result.item.sku,
        detail: `ปรับสต็อก ${result.item.sku}: ${result.previousStock} -> ${result.newStock} (${result.qtyChange >= 0 ? '+' : ''}${result.qtyChange})`,
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

export default router;
