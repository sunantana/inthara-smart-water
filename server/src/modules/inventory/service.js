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

export function formatPackagingLot(row) {
  if (!row) return null;
  const quantity = Number(row.quantity ?? 0);
  const remainingQty = Number(row.remaining_qty ?? 0);
  const unitCostSat = Number(row.unit_cost_sat ?? 0);
  return {
    id: row.id,
    lotNo: row.lot_no,
    lot_no: row.lot_no,
    purchaseDate: row.purchase_date,
    purchase_date: row.purchase_date,
    sku: row.sku,
    itemName: row.item_name ?? row.sku,
    unit: row.item_unit ?? 'ชิ้น',
    quantity,
    remainingQty,
    remaining_qty: remainingQty,
    unitCostSat,
    unit_cost_sat: unitCostSat,
    totalCostSat: quantity * unitCostSat,
    supplier: row.supplier ?? null,
    linkedAssetId: row.linked_asset_id ?? null,
    linked_asset_id: row.linked_asset_id ?? null,
    linkedAssetCode: row.linked_asset_code ?? null,
    linkedAssetName: row.linked_asset_name ?? null,
    status: row.status,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

/**
 * สร้างหรืออัปเดต 5 SKU หลัก + 3 SKU บรรจุภัณฑ์เริ่มต้นใน inventory_items
 * พร้อมล็อตบรรจุภัณฑ์ตั้งต้นสำหรับทดสอบ FIFO (PKG-BOTTLE-189L, PKG-CAP, PKG-LABEL)
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

    // Seed SKU บรรจุภัณฑ์และล็อตบรรจุภัณฑ์เริ่มต้น (หากยังไม่มี)
    for (const pkgDef of repo.DEFAULT_PACKAGING_ITEMS) {
      const inserted = repo.insertDefaultInventoryIfMissing(pkgDef);
      if (overwrite) {
        repo.upsertInventoryItem(pkgDef);
      }
      results.push({
        ...pkgDef,
        status: inserted ? 'created' : 'kept',
      });
    }

    for (const lotDef of repo.DEFAULT_SEED_PACKAGING_LOTS) {
      const existingLot = repo.findPackagingLotByLotNo(lotDef.lotNo);
      if (!existingLot) {
        repo.insertPackagingLot({
          ...lotDef,
          remainingQty: lotDef.quantity,
          status: 'active',
        });
      }
    }

    // ซิงค์สต็อกของ SKU บรรจุภัณฑ์ให้เท่ากับ SUM(remaining_qty) ของล็อตที่ active เสมอ
    for (const pkgDef of repo.DEFAULT_PACKAGING_ITEMS) {
      if (stockOverrides && Object.prototype.hasOwnProperty.call(stockOverrides, pkgDef.sku)) {
        repo.setInventoryStock(pkgDef.sku, Number(stockOverrides[pkgDef.sku]));
      } else {
        repo.syncInventoryStockWithPackagingLots(pkgDef.sku);
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
      const defaultDef = [
        ...repo.DEFAULT_INVENTORY_ITEMS,
        ...repo.DEFAULT_PACKAGING_ITEMS,
      ].find((d) => d.sku === cleanSku);
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

// ============ PACKAGING FIFO (INV-2, INV-3) ============

/**
 * Pure helper คำนวณแผนการตัดบรรจุภัณฑ์แบบ FIFO จากรายการล็อตที่มี (สำหรับ Unit Test และใช้ใน consumePackagingFifo)
 * เรียงตาม purchase_date ASC, id ASC
 */
export function calculatePackagingFifoPlan(sku, lots = [], neededQty = 0) {
  const required = Math.max(0, Math.trunc(Number(neededQty) || 0));
  if (required <= 0) {
    return {
      sku,
      neededQty: 0,
      totalAvailable: lots.reduce((s, l) => s + Math.max(0, Number(l.remaining_qty ?? l.remainingQty ?? 0)), 0),
      deductions: [],
      totalCostSat: 0,
    };
  }

  const activeLots = lots
    .filter((l) => (l.status ?? 'active') === 'active' && Number(l.remaining_qty ?? l.remainingQty ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      const dateA = String(a.purchase_date ?? a.purchaseDate ?? '');
      const dateB = String(b.purchase_date ?? b.purchaseDate ?? '');
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return Number(a.id ?? 0) - Number(b.id ?? 0);
    });

  const totalAvailable = activeLots.reduce(
    (sum, l) => sum + Number(l.remaining_qty ?? l.remainingQty ?? 0),
    0,
  );

  if (totalAvailable < required) {
    throw AppError.badRequest(
      `สต็อกบรรจุภัณฑ์ [${sku}] ไม่เพียงพอสำหรับตัด FIFO: ต้องการ ${required} แต่คงเหลือรวม ${totalAvailable}`,
      [
        {
          field: 'sku',
          sku,
          required,
          available: totalAvailable,
          issue: `บรรจุภัณฑ์ ${sku} คงเหลือ ${totalAvailable} ไม่พอตัด ${required}`,
        },
      ],
    );
  }

  let remainToTake = required;
  let totalCostSat = 0;
  const deductions = [];

  for (const lot of activeLots) {
    if (remainToTake <= 0) break;
    const beforeQty = Number(lot.remaining_qty ?? lot.remainingQty ?? 0);
    const takeQty = Math.min(beforeQty, remainToTake);
    const afterQty = beforeQty - takeQty;
    const nextStatus = afterQty <= 0 ? 'depleted' : 'active';
    const unitCostSat = Number(lot.unit_cost_sat ?? lot.unitCostSat ?? 0);
    const lineCostSat = takeQty * unitCostSat;

    remainToTake -= takeQty;
    totalCostSat += lineCostSat;

    deductions.push({
      id: lot.id,
      lotNo: lot.lot_no ?? lot.lotNo,
      purchaseDate: lot.purchase_date ?? lot.purchaseDate,
      sku,
      beforeQty,
      takeQty,
      afterQty,
      nextStatus,
      unitCostSat,
      lineCostSat,
    });
  }

  return {
    sku,
    neededQty: required,
    totalAvailable,
    remainingTotalAfter: totalAvailable - required,
    deductions,
    totalCostSat,
  };
}

/**
 * POST /api/inventory/packaging-lots
 * รับเข้าล็อตบรรจุภัณฑ์ใหม่ + เพิ่มสต็อกใน inventory_items + บันทึก stock_movements (reason = 'packaging_in')
 * รองรับการผูกกับสินทรัพย์ (linkedAssetId — INV-3)
 */
export function createPackagingLot(payload, actorId = null) {
  const lotNo = String(payload.lotNo || '').trim();
  const purchaseDate = String(payload.purchaseDate || '').trim();
  const sku = String(payload.sku || '').trim();
  const quantity = Math.trunc(Number(payload.quantity));
  const unitCostSat = Math.trunc(Number(payload.unitCostSat ?? 0));
  const supplier = payload.supplier?.trim() || null;
  const linkedAssetId = payload.linkedAssetId ? Number(payload.linkedAssetId) : null;

  const db = getDb();
  const runTx = db.transaction(() => {
    const duplicate = repo.findPackagingLotByLotNo(lotNo);
    if (duplicate) {
      throw AppError.conflict(`เลขที่ล็อตบรรจุภัณฑ์ [${lotNo}] มีอยู่ในระบบแล้ว`);
    }

    if (linkedAssetId) {
      const asset = repo.findAssetById(linkedAssetId);
      if (!asset) {
        throw AppError.notFound(`ไม่พบสินทรัพย์รหัส ID ${linkedAssetId} ที่ต้องการผูกกับล็อตบรรจุภัณฑ์`);
      }
    }

    // ถ้า SKU บรรจุภัณฑ์ยังไม่มีใน inventory_items ให้สร้างให้อัตโนมัติ (หมวด packaging)
    let item = repo.findInventoryItemBySku(sku);
    if (!item) {
      const knownDef = repo.DEFAULT_PACKAGING_ITEMS.find((d) => d.sku === sku) || {
        sku,
        name: `บรรจุภัณฑ์ ${sku}`,
        category: 'packaging',
        unit: 'ชิ้น',
        stock: 0,
        min_stock: 50,
        unit_cost_sat: unitCostSat,
        unit_price_sat: null,
      };
      repo.insertDefaultInventoryIfMissing({ ...knownDef, stock: 0 });
      item = repo.findInventoryItemBySku(sku);
    }

    const lotId = repo.insertPackagingLot({
      lotNo,
      purchaseDate,
      sku,
      quantity,
      remainingQty: quantity,
      unitCostSat,
      supplier,
      linkedAssetId,
      status: 'active',
    });

    // อัปเดตสต็อกรวมของ SKU ให้เท่ากับ SUM(remaining_qty) ของล็อตทั้งหมด และอัปเดตต้นทุนล่าสุด
    const newTotalStock = repo.syncInventoryStockWithPackagingLots(sku);
    if (unitCostSat > 0) {
      repo.updateInventoryItemFields(sku, { unit_cost_sat: unitCostSat });
    }

    repo.insertStockMovement({
      sku,
      qtyChange: quantity,
      reason: 'packaging_in',
      refType: 'packaging_lot',
      refId: String(lotId),
      lotNo,
      performedBy: actorId,
    });

    const createdLot = formatPackagingLot(repo.findPackagingLotById(lotId));
    const updatedItem = formatInventoryItem(repo.findInventoryItemBySku(sku));

    return {
      ...createdLot,
      totalSkuStock: newTotalStock,
      inventoryItem: updatedItem,
      data: createdLot,
    };
  });

  return runTx();
}

/**
 * GET /api/inventory/packaging-lots?sku&status
 */
export function listPackagingLots(query = {}) {
  const sku = (query.sku ?? '').trim();
  const status = (query.status ?? '').trim();

  const rows = repo.listPackagingLots({ sku, status });
  const lots = rows.map(formatPackagingLot);

  const summaryBySku = {};
  for (const lot of lots) {
    if (!summaryBySku[lot.sku]) {
      summaryBySku[lot.sku] = {
        sku: lot.sku,
        totalQuantity: 0,
        totalRemainingQty: 0,
        activeLotsCount: 0,
        depletedLotsCount: 0,
      };
    }
    summaryBySku[lot.sku].totalQuantity += lot.quantity;
    if (lot.status === 'active') {
      summaryBySku[lot.sku].totalRemainingQty += lot.remainingQty;
      summaryBySku[lot.sku].activeLotsCount += 1;
    } else if (lot.status === 'depleted') {
      summaryBySku[lot.sku].depletedLotsCount += 1;
    }
  }

  return {
    data: lots,
    lots,
    summaryBySku,
  };
}

/**
 * ฟังก์ชันภายใน: ตัดสต็อกบรรจุภัณฑ์แบบ FIFO (เก่า→ใหม่ตาม purchase_date ASC, id ASC)
 * - ล็อตที่ถูกตัดจน remaining_qty = 0 จะเปลี่ยน status เป็น 'depleted' ทันที
 * - บันทึก stock_movements (reason = 'packaging_consume', qty_change = -takeQty) ต่อล็อตที่ถูกตัด
 * - ซิงค์ inventory_items.stock ของ SKU นั้นให้เท่ากับ SUM(remaining_qty) ของล็อตทั้งหมดเสมอ
 * - หากคงเหลือรวมไม่พอ จะโยน AppError.badRequest (400) พร้อมระบุ SKU และจำนวนคงเหลือชัดเจน
 */
export function consumePackagingFifo(
  sku,
  qty,
  { refType = 'production_lot', refId = null, performedBy = null } = {},
) {
  const cleanSku = String(sku || '').trim();
  const neededQty = Math.trunc(Number(qty) || 0);
  if (neededQty <= 0) {
    return {
      sku: cleanSku,
      neededQty: 0,
      deductions: [],
      totalCostSat: 0,
      remainingTotalAfter: repo.sumRemainingPackagingStockBySku(cleanSku),
    };
  }

  const activeLots = repo.listActivePackagingLotsForSkuFifo(cleanSku);
  const plan = calculatePackagingFifoPlan(cleanSku, activeLots, neededQty);

  for (const ded of plan.deductions) {
    repo.updatePackagingLotRemainingAndStatus(ded.id, {
      remainingQty: ded.afterQty,
      status: ded.nextStatus,
    });

    repo.insertStockMovement({
      sku: cleanSku,
      qtyChange: -ded.takeQty,
      reason: 'packaging_consume',
      refType,
      refId: refId !== null && refId !== undefined ? String(refId) : null,
      lotNo: ded.lotNo,
      performedBy,
    });
  }

  const syncedStock = repo.syncInventoryStockWithPackagingLots(cleanSku);

  return {
    ...plan,
    remainingTotalAfter: syncedStock,
  };
}
