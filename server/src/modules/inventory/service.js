import { getDb } from '../../db/connection.js';
import { AppError } from '../../utils/errors.js';
import { computePaginationMeta } from '../customers/service.js';
import * as repo from './repo.js';

export function formatInventoryItem(row) {
  if (!row) return null;
  const stock = Number(row.stock ?? 0);
  const minStock = Number(row.min_stock ?? 0);
  const unitCostSat = Number(row.unit_cost_sat ?? 0);
  const unitPriceSat = Number(row.unit_price_sat ?? 0);
  const belowMin = stock < minStock;

  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    stock,
    minStock,
    min_stock: minStock,
    unitCostSat,
    unit_cost_sat: unitCostSat,
    unitPriceSat,
    unit_price_sat: unitPriceSat,
    belowMin,
    below_min: belowMin,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  };
}

export function formatStockMovement(row) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    itemName: row.item_name ?? row.sku,
    item_name: row.item_name ?? row.sku,
    unit: row.item_unit ?? '',
    qtyChange: Number(row.qty_change ?? 0),
    qty_change: Number(row.qty_change ?? 0),
    reason: row.reason,
    refType: row.ref_type ?? null,
    ref_type: row.ref_type ?? null,
    refId: row.ref_id ?? null,
    ref_id: row.ref_id ?? null,
    note: row.ref_type === 'manual_adjust' ? (row.ref_id ?? null) : null,
    lotNo: row.lot_no ?? null,
    lot_no: row.lot_no ?? null,
    performedBy: row.performed_by ?? null,
    performed_by: row.performed_by ?? null,
    performedByName: row.performed_by_name ?? null,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

/**
 * สร้างหรืออัปเดต 5 SKU หลักใน inventory_items สำหรับเริ่มต้นระบบ (FG-189L, FG-350ML, FG-600ML, FG-1500ML, RET-189L-EMPTY)
 */
export function seedDefaultInventoryItems(stockOverrides = {}, { overwrite = false } = {}) {
  const db = getDb();
  const results = [];

  const runTx = db.transaction(() => {
    for (const def of repo.DEFAULT_INVENTORY_ITEMS) {
      const overrideStock =
        stockOverrides && Object.prototype.hasOwnProperty.call(stockOverrides, def.sku)
          ? Number(stockOverrides[def.sku])
          : def.stock;
      const itemToSeed = {
        ...def,
        stock: overrideStock,
      };

      if (overwrite) {
        const res = repo.upsertInventoryItem(itemToSeed);
        results.push({ ...itemToSeed, status: res.action });
      } else {
        const inserted = repo.insertDefaultInventoryIfMissing(itemToSeed);
        results.push({
          ...itemToSeed,
          status: inserted ? 'created' : 'kept',
        });
      }
    }
  });

  runTx();
  return results;
}

export function listInventoryItems(query = {}) {
  const category = (query.category ?? '').trim();
  const lowStockOnly = Boolean(query.lowStockOnly);

  const rows = repo.listInventoryItems({ category, lowStockOnly });
  const items = rows.map(formatInventoryItem);
  const lowStockCount = items.filter((item) => item.belowMin).length;

  return {
    data: items,
    items,
    summary: {
      totalSkus: items.length,
      lowStockCount,
    },
  };
}

export function getInventoryItemBySku(sku) {
  const cleanSku = String(sku || '').trim();
  const row = repo.findInventoryItemBySku(cleanSku);
  if (!row) {
    throw AppError.notFound(`ไม่พบรหัสสินค้า ${cleanSku} ในคลัง`);
  }
  return formatInventoryItem(row);
}

export function updateInventoryItem(sku, payload) {
  const cleanSku = String(sku || '').trim();
  const existing = repo.findInventoryItemBySku(cleanSku);
  if (!existing) {
    throw AppError.notFound(`ไม่พบรหัสสินค้า ${cleanSku} ในคลัง`);
  }

  const fields = {};
  if (payload.name !== undefined) fields.name = payload.name;
  if (payload.unit !== undefined) fields.unit = payload.unit;

  const minStock = payload.minStock !== undefined ? payload.minStock : payload.min_stock;
  if (minStock !== undefined) fields.min_stock = Number(minStock);

  const unitCostSat =
    payload.unitCostSat !== undefined ? payload.unitCostSat : payload.unit_cost_sat;
  if (unitCostSat !== undefined) fields.unit_cost_sat = Number(unitCostSat);

  const unitPriceSat =
    payload.unitPriceSat !== undefined ? payload.unitPriceSat : payload.unit_price_sat;
  if (unitPriceSat !== undefined) fields.unit_price_sat = Number(unitPriceSat);

  repo.updateInventoryItemFields(cleanSku, fields);
  return getInventoryItemBySku(cleanSku);
}

export function adjustInventoryStock(payload, actorId = null) {
  const cleanSku = String(payload.sku || '').trim();
  const newStock = Math.trunc(Number(payload.newStock));
  if (!Number.isFinite(newStock) || newStock < 0) {
    throw AppError.badRequest('จำนวนสต็อกใหม่ต้องเป็นจำนวนเต็มไม่ติดลบ');
  }

  const rawReason = String(payload.reason || 'adjustment').trim();
  const lotNo = payload.lotNo ?? null;

  const db = getDb();
  const runAdjustTx = db.transaction(() => {
    let existing = repo.findInventoryItemBySku(cleanSku);
    if (!existing) {
      const defaultDef = repo.DEFAULT_INVENTORY_ITEMS.find((d) => d.sku === cleanSku);
      if (defaultDef) {
        repo.insertDefaultInventoryIfMissing({ ...defaultDef, stock: 0 });
        existing = repo.findInventoryItemBySku(cleanSku);
      } else {
        throw AppError.notFound(`ไม่พบรหัสสินค้า ${cleanSku} ในคลัง`);
      }
    }

    const oldStock = Number(existing.stock ?? 0);
    const qtyChange = newStock - oldStock;

    repo.setInventoryStock(cleanSku, newStock);
    const movementId = repo.insertStockMovement({
      sku: cleanSku,
      qtyChange,
      reason: 'adjustment',
      refType: 'manual_adjust',
      refId: rawReason || 'adjustment',
      lotNo,
      performedBy: actorId,
    });

    const updatedItem = formatInventoryItem(repo.findInventoryItemBySku(cleanSku));
    const movement = formatStockMovement(repo.findStockMovementById(movementId));

    return {
      item: updatedItem,
      movement,
      previousStock: oldStock,
      newStock,
      qtyChange,
    };
  });

  return runAdjustTx();
}

export function listStockMovements(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);

  const { rows, total } = repo.listStockMovements({
    sku: (query.sku ?? '').trim(),
    reason: (query.reason ?? '').trim(),
    dateFrom: (query.dateFrom ?? '').trim(),
    dateTo: (query.dateTo ?? '').trim(),
    page,
    limit,
  });

  const formatted = rows.map(formatStockMovement);
  return {
    data: formatted,
    items: formatted,
    movements: formatted,
    meta: computePaginationMeta(page, limit, total),
  };
}
