import { AppError } from '../../utils/errors.js';
import { computePaginationMeta } from '../customers/service.js';
import * as inventoryRepo from '../inventory/repo.js';
import { consumePackagingFifo } from '../inventory/service.js';
import * as repo from './repo.js';
import { FG_SKUS } from './schema.js';

/**
 * สร้าง prefix เลขที่ล็อตผลิตตามวันที่และกะ (PRD-4)
 * รูปแบบ: LOT-YYMMDD-D- (กะกลางวัน day) หรือ LOT-YYMMDD-N- (กะกลางคืน night)
 */
export function buildProductionLotPrefix(productionDate, shift = 'day') {
  const cleanDate = String(productionDate || '').trim();
  const yymmdd = /^\d{4}-\d{2}-\d{2}$/.test(cleanDate)
    ? cleanDate.slice(2).replace(/-/g, '')
    : new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const shiftCode = shift === 'night' || shift === 'N' ? 'N' : 'D';
  return `LOT-${yymmdd}-${shiftCode}-`;
}

/**
 * Pure helper คำนวณเลขที่ล็อตถัดไปจากรายการ lot_no ที่มีอยู่แล้วของวันและกะนั้น
 * เช่น ถ้ายังไม่มี → LOT-261106-D-1, มี LOT-261106-D-1 แล้ว → LOT-261106-D-2
 */
export function generateNextProductionLotNo(productionDate, shift = 'day', existingLotNos = []) {
  const prefix = buildProductionLotPrefix(productionDate, shift);
  let maxSeq = 0;

  for (const lotNo of existingLotNos) {
    const str = String(lotNo || '').trim();
    if (str.startsWith(prefix)) {
      const tail = str.slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  return `${prefix}${maxSeq + 1}`;
}

export function normalizeSkuQtyMap(raw = {}) {
  return {
    'FG-189L': Math.max(0, Math.trunc(Number(raw['FG-189L'] ?? 0))),
    'FG-350ML': Math.max(0, Math.trunc(Number(raw['FG-350ML'] ?? 0))),
    'FG-600ML': Math.max(0, Math.trunc(Number(raw['FG-600ML'] ?? 0))),
    'FG-1500ML': Math.max(0, Math.trunc(Number(raw['FG-1500ML'] ?? 0))),
  };
}

export function parseJsonSafe(rawJson) {
  if (!rawJson) return normalizeSkuQtyMap({});
  try {
    return normalizeSkuQtyMap(JSON.parse(rawJson));
  } catch {
    return normalizeSkuQtyMap({});
  }
}

export function mapProductionLotDto(row) {
  if (!row) return null;
  const plan = parseJsonSafe(row.plan_json);
  const actual = parseJsonSafe(row.actual_json);

  const qaPassed =
    row.qa_passed === null || row.qa_passed === undefined
      ? null
      : Number(row.qa_passed) === 1;

  const qaStatus =
    qaPassed === null ? 'pending' : qaPassed ? 'passed' : 'failed';

  return {
    id: row.id,
    lotNo: row.lot_no,
    lot_no: row.lot_no,
    productionDate: row.production_date,
    production_date: row.production_date,
    shift: row.shift,
    shiftCode: row.shift === 'night' ? 'N' : 'D',
    plan,
    actual,
    tdsRaw: row.tds_raw !== null && row.tds_raw !== undefined ? Number(row.tds_raw) : null,
    tds_raw: row.tds_raw !== null && row.tds_raw !== undefined ? Number(row.tds_raw) : null,
    tdsRo: row.tds_ro !== null && row.tds_ro !== undefined ? Number(row.tds_ro) : null,
    tds_ro: row.tds_ro !== null && row.tds_ro !== undefined ? Number(row.tds_ro) : null,
    ph: row.ph !== null && row.ph !== undefined ? Number(row.ph) : null,
    qaPassed,
    qa_passed: row.qa_passed,
    qaStatus,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
  };
}

/**
 * คำนวณรายการบรรจุภัณฑ์ที่ต้องตัดแบบ FIFO เมื่อล็อตผลิตผ่าน QA
 * - ถ้าระบุ packagingConsumptions มาโดยตรง ใช้ตามนั้น
 * - ถ้าไม่ระบุ จะคำนวณตามสูตรมาตรฐานจากยอดผลิตจริง (actual):
 *   * FG-189L ใช้ PKG-BOTTLE-189L (1 ต่อ 1 ถัง) หากมีล็อต active ในคลัง
 *   * ทุก SKU (FG-189L + FG-350ML + FG-600ML + FG-1500ML) ใช้ PKG-CAP และ PKG-LABEL หากมีล็อต active ในคลัง
 */
export function resolveRequiredPackagingForLot(actual, explicitConsumptions) {
  if (Array.isArray(explicitConsumptions) && explicitConsumptions.length > 0) {
    return explicitConsumptions
      .map((c) => ({
        sku: String(c.sku || '').trim(),
        qty: Math.max(0, Math.trunc(Number(c.qty) || 0)),
      }))
      .filter((c) => c.sku && c.qty > 0);
  }

  const required = [];
  const qty189L = Number(actual['FG-189L'] ?? 0);
  const totalPacks =
    Number(actual['FG-350ML'] ?? 0) +
    Number(actual['FG-600ML'] ?? 0) +
    Number(actual['FG-1500ML'] ?? 0);
  const totalUnits = qty189L + totalPacks;

  // หากมีการผลิต FG-189L และในระบบมีล็อตบรรจุภัณฑ์ PKG-BOTTLE-189L อยู่ในตาราง packaging_lots ให้ตัด FIFO
  const allBottleLots = inventoryRepo.listPackagingLots({ sku: 'PKG-BOTTLE-189L' });
  if (qty189L > 0 && allBottleLots.length > 0) {
    required.push({ sku: 'PKG-BOTTLE-189L', qty: qty189L });
  }

  const allCapLots = inventoryRepo.listPackagingLots({ sku: 'PKG-CAP' });
  if (totalUnits > 0 && allCapLots.length > 0) {
    required.push({ sku: 'PKG-CAP', qty: totalUnits });
  }

  const allLabelLots = inventoryRepo.listPackagingLots({ sku: 'PKG-LABEL' });
  if (totalUnits > 0 && allLabelLots.length > 0) {
    required.push({ sku: 'PKG-LABEL', qty: totalUnits });
  }

  return required;
}

/**
 * POST /api/production/lots
 * บันทึกล็อตผลิตใหม่และออกเลข lotNo อัตโนมัติ (LOT-YYMMDD-D/N-ลำดับ) ใน transaction เดียว
 */
export function createProductionLot(payload, actorId = null) {
  const productionDate = payload.productionDate || new Date().toISOString().slice(0, 10);
  const shift = payload.shift === 'night' ? 'night' : 'day';
  const plan = normalizeSkuQtyMap(payload.plan);
  const actual = normalizeSkuQtyMap(payload.actual);

  const lotId = repo.runInTransaction(() => {
    const prefix = buildProductionLotPrefix(productionDate, shift);
    const existingLotNos = repo.listExistingLotNosByPrefix(prefix);
    const lotNo = generateNextProductionLotNo(productionDate, shift, existingLotNos);

    return repo.insertProductionLot({
      lotNo,
      productionDate,
      shift,
      planJson: JSON.stringify(plan),
      actualJson: JSON.stringify(actual),
      tdsRaw: payload.tdsRaw ?? null,
      tdsRo: payload.tdsRo ?? null,
      ph: payload.ph ?? null,
      qaPassed: null,
      notes: payload.notes ?? null,
      createdBy: actorId,
    });
  });

  const created = mapProductionLotDto(repo.findProductionLotById(lotId));
  return {
    ...created,
    data: created,
  };
}

/**
 * POST /api/production/lots/:id/qa
 * ตรวจรับคุณภาพน้ำของล็อตผลิต (PRD-2, PRD-3):
 * - ถ้าตรวจ QA ไปแล้ว (qa_passed IS NOT NULL) → โยน 409 CONFLICT ห้ามตรวจซ้ำ
 * - ถ้า passed = false → อัปเดต qa_passed = 0, ห้ามเพิ่ม FG หรือตัดบรรจุภัณฑ์ใดๆ
 * - ถ้า passed = true → ใน transaction เดียว:
 *   1) อัปเดต qa_passed = 1 (พร้อมค่า tdsRaw/tdsRo/ph ถ้าส่งมา)
 *   2) ตัดบรรจุภัณฑ์แบบ FIFO (consumePackagingFifo) — ถ้าไม่พอจะโยน 400 และ rollback ทั้งหมดทันที
 *   3) เพิ่มสต็อกสินค้าสำเร็จรูป (FG) ตามยอดผลิตจริง (actual) + บันทึก stock_movements (reason = 'production_in')
 */
export function evaluateProductionLotQa(id, payload, actorId = null) {
  const lotId = Number(id);

  return repo.runInTransaction(() => {
    const existing = repo.findProductionLotById(lotId);
    if (!existing) {
      throw AppError.notFound('ไม่พบข้อมูลล็อตผลิตที่ระบุ');
    }

    if (existing.qa_passed !== null && existing.qa_passed !== undefined) {
      throw AppError.conflict(
        `ล็อตผลิต [${existing.lot_no}] ผ่านการตรวจรับ QA ไปแล้ว ไม่สามารถบันทึกผล QA ซ้ำได้`,
      );
    }

    const passed = Boolean(payload.passed);
    repo.updateProductionLotQa(lotId, {
      qaPassed: passed ? 1 : 0,
      tdsRaw: payload.tdsRaw,
      tdsRo: payload.tdsRo,
      ph: payload.ph,
      notes: payload.notes,
    });

    const fgMovements = [];
    const packagingConsumed = [];

    if (passed) {
      const actual = parseJsonSafe(existing.actual_json);

      // 1) ตัดบรรจุภัณฑ์แบบ FIFO ก่อน (หากไม่พอจะ throw 400 และ rollback ทั้ง transaction)
      const requiredPackaging = resolveRequiredPackagingForLot(
        actual,
        payload.packagingConsumptions,
      );

      for (const reqPkg of requiredPackaging) {
        const fifoResult = consumePackagingFifo(reqPkg.sku, reqPkg.qty, {
          refType: 'production_lot',
          refId: String(lotId),
          performedBy: actorId,
        });
        packagingConsumed.push(fifoResult);
      }

      // 2) เพิ่มสต็อกสินค้าสำเร็จรูป (FG) และบันทึก stock_movements (reason = 'production_in')
      for (const sku of FG_SKUS) {
        const qty = Number(actual[sku] ?? 0);
        if (qty <= 0) continue;

        let fgItem = inventoryRepo.findInventoryItemBySku(sku);
        if (!fgItem) {
          const def = inventoryRepo.DEFAULT_INVENTORY_ITEMS.find((d) => d.sku === sku);
          if (def) {
            inventoryRepo.insertDefaultInventoryIfMissing({ ...def, stock: 0 });
          }
        }

        inventoryRepo.changeInventoryStockByDelta(sku, qty);
        const movId = inventoryRepo.insertStockMovement({
          sku,
          qtyChange: qty,
          reason: 'production_in',
          refType: 'production_lot',
          refId: String(lotId),
          lotNo: existing.lot_no,
          performedBy: actorId,
        });

        const updatedFg = inventoryRepo.findInventoryItemBySku(sku);
        fgMovements.push({
          movementId: movId,
          sku,
          qtyAdded: qty,
          newStock: Number(updatedFg?.stock ?? qty),
        });
      }
    }

    const updatedLot = mapProductionLotDto(repo.findProductionLotById(lotId));
    return {
      ...updatedLot,
      fgMovements,
      packagingConsumed,
      data: {
        ...updatedLot,
        fgMovements,
        packagingConsumed,
      },
    };
  });
}

/**
 * GET /api/production/lots?dateFrom&dateTo&shift&page&limit
 */
export function listProductionLots(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;

  const { rows, total } = repo.listProductionLots({
    offset,
    limit,
    dateFrom: (query.dateFrom ?? '').trim(),
    dateTo: (query.dateTo ?? '').trim(),
    shift: (query.shift ?? '').trim(),
  });

  const data = rows.map(mapProductionLotDto);
  return {
    data,
    lots: data,
    meta: computePaginationMeta(page, limit, total),
  };
}

/**
 * GET /api/production/dashboard?dateFrom&dateTo
 * สรุปแผนการผลิตเทียบยอดผลิตจริงต่อกะและต่อวัน พร้อมสถิติผลตรวจ QA (PRD-5)
 */
export function getProductionDashboard(query = {}) {
  const rows = repo.listProductionLotsForDashboard({
    dateFrom: (query.dateFrom ?? '').trim(),
    dateTo: (query.dateTo ?? '').trim(),
  });

  const lots = rows.map(mapProductionLotDto);

  const emptySkuTotals = () => ({
    'FG-189L': 0,
    'FG-350ML': 0,
    'FG-600ML': 0,
    'FG-1500ML': 0,
  });

  const totalPlan = emptySkuTotals();
  const totalActual = emptySkuTotals();

  const byShift = {
    day: {
      shift: 'day',
      label: 'กะกลางวัน (Day Shift)',
      lotsCount: 0,
      qaPassedCount: 0,
      qaFailedCount: 0,
      qaPendingCount: 0,
      plan: emptySkuTotals(),
      actual: emptySkuTotals(),
    },
    night: {
      shift: 'night',
      label: 'กะกลางคืน (Night Shift)',
      lotsCount: 0,
      qaPassedCount: 0,
      qaFailedCount: 0,
      qaPendingCount: 0,
      plan: emptySkuTotals(),
      actual: emptySkuTotals(),
    },
  };

  /** @type {Map<string, any>} */
  const byDateMap = new Map();

  let qaPassedCount = 0;
  let qaFailedCount = 0;
  let qaPendingCount = 0;

  for (const lot of lots) {
    const shiftBucket = byShift[lot.shift] || byShift.day;
    shiftBucket.lotsCount += 1;

    if (lot.qaPassed === true) {
      qaPassedCount += 1;
      shiftBucket.qaPassedCount += 1;
    } else if (lot.qaPassed === false) {
      qaFailedCount += 1;
      shiftBucket.qaFailedCount += 1;
    } else {
      qaPendingCount += 1;
      shiftBucket.qaPendingCount += 1;
    }

    let dateBucket = byDateMap.get(lot.productionDate);
    if (!dateBucket) {
      dateBucket = {
        date: lot.productionDate,
        lotsCount: 0,
        plan: emptySkuTotals(),
        actual: emptySkuTotals(),
      };
      byDateMap.set(lot.productionDate, dateBucket);
    }
    dateBucket.lotsCount += 1;

    for (const sku of FG_SKUS) {
      const p = Number(lot.plan[sku] ?? 0);
      const a = Number(lot.actual[sku] ?? 0);
      totalPlan[sku] += p;
      totalActual[sku] += a;
      shiftBucket.plan[sku] += p;
      shiftBucket.actual[sku] += a;
      dateBucket.plan[sku] += p;
      dateBucket.actual[sku] += a;
    }
  }

  const byDate = Array.from(byDateMap.values());

  return {
    summary: {
      totalLots: lots.length,
      qaPassedCount,
      qaFailedCount,
      qaPendingCount,
      plan: totalPlan,
      actual: totalActual,
    },
    byShift: [byShift.day, byShift.night],
    byDate,
    data: {
      summary: {
        totalLots: lots.length,
        qaPassedCount,
        qaFailedCount,
        qaPendingCount,
        plan: totalPlan,
        actual: totalActual,
      },
      byShift: [byShift.day, byShift.night],
      byDate,
    },
  };
}
