import { AppError } from '../../utils/errors.js';
import { computePaginationMeta } from '../customers/service.js';
import * as inventoryRepo from '../inventory/repo.js';
import { seedDefaultInventoryItems } from '../inventory/service.js';
import * as repo from './repo.js';

export function seedDefaultCmmsResources() {
  seedDefaultInventoryItems();
  return repo.runInTransaction(() => {
    const seeded = [];
    for (const m of repo.DEFAULT_SEED_MACHINES) {
      seeded.push(repo.upsertSeedMachineWithAsset(m));
    }
    return seeded;
  });
}

export function mapMachineDto(row) {
  if (!row) return null;
  const runHours = Number(row.run_hours ?? 0);
  const pmIntervalHours =
    row.pm_interval_hours !== null && row.pm_interval_hours !== undefined
      ? Number(row.pm_interval_hours)
      : null;

  const pmProgressPct =
    pmIntervalHours && pmIntervalHours > 0
      ? Math.round((runHours / pmIntervalHours) * 100)
      : 0;

  const isDuePm =
    pmIntervalHours !== null &&
    pmIntervalHours > 0 &&
    runHours >= pmIntervalHours * 0.9;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category ?? null,
    brand: row.brand ?? null,
    model: row.model ?? null,
    watts: row.watts !== null && row.watts !== undefined ? Number(row.watts) : null,
    capacity: row.capacity ?? null,
    status: row.status,
    runHours,
    run_hours: runHours,
    pmIntervalHours,
    pm_interval_hours: pmIntervalHours,
    pmProgressPct,
    isDuePm,
    lastPmDate: row.last_pm_date ?? null,
    last_pm_date: row.last_pm_date ?? null,
    linkedAssetId: row.linked_asset_id ?? null,
    linked_asset_id: row.linked_asset_id ?? null,
    linkedAssetCode: row.linked_asset_code ?? null,
    linkedAssetStatus: row.linked_asset_status ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMaintenanceLogDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    machineCode: row.machine_code,
    machine_code: row.machine_code,
    machineName: row.machine_name ?? row.machine_code,
    performedDate: row.performed_date,
    performed_date: row.performed_date,
    type: row.type,
    action: row.action,
    technician: row.technician ?? null,
    costSat: Number(row.cost_sat ?? 0),
    cost_sat: Number(row.cost_sat ?? 0),
    spareSku: row.spare_sku ?? null,
    spare_sku: row.spare_sku ?? null,
    spareName: row.spare_name ?? null,
    spareUnit: row.spare_unit ?? null,
    spareQty: row.spare_qty !== null && row.spare_qty !== undefined ? Number(row.spare_qty) : null,
    spare_qty: row.spare_qty !== null && row.spare_qty !== undefined ? Number(row.spare_qty) : null,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function listMachines() {
  let rows = repo.listMachines();
  if (rows.length === 0) {
    seedDefaultCmmsResources();
    rows = repo.listMachines();
  }
  const data = rows.map(mapMachineDto);
  return {
    data,
    items: data,
    machines: data,
    total: data.length,
  };
}

/**
 * GET /api/machines/due-pm
 * คืนรายการเครื่องจักรที่ชั่วโมงทำงาน (run_hours) >= 90% ของ pm_interval_hours (MNT-3)
 */
export function listDuePmMachines() {
  const { data } = listMachines();
  const due = data.filter((m) => m.isDuePm);
  return {
    data: due,
    items: due,
    machines: due,
    totalDue: due.length,
    total: due.length,
  };
}

/**
 * PUT /api/machines/:code/status
 * เปลี่ยนสถานะเครื่องจักรเฉพาะ available ↔ maintenance และซิงค์สถานะของสินทรัพย์ที่ผูกไว้ใน transaction เดียว (MNT-4)
 */
export function updateMachineStatus(code, payload) {
  const cleanCode = String(code || '').trim();
  const targetStatus = payload.status;

  if (targetStatus !== 'available' && targetStatus !== 'maintenance') {
    throw AppError.badRequest('อนุญาตให้เปลี่ยนสถานะเครื่องจักรเฉพาะ available หรือ maintenance เท่านั้น');
  }

  return repo.runInTransaction(() => {
    const existing = repo.findMachineByCode(cleanCode);
    if (!existing) {
      throw AppError.notFound(`ไม่พบเครื่องจักรหมายเลขรหัส ${cleanCode}`);
    }

    const updated = repo.updateMachineStatusAndSyncAsset(cleanCode, targetStatus);
    const dto = mapMachineDto(updated);
    return {
      ...dto,
      data: dto,
    };
  });
}

/**
 * PUT /api/machines/:code/hours
 * อัปเดตชั่วโมงการทำงานของเครื่องจักร (เพื่อบันทึกชั่วโมงเดินเครื่องหรือตั้งค่า PM interval)
 */
export function updateMachineRunHours(code, payload) {
  const cleanCode = String(code || '').trim();
  const existing = repo.findMachineByCode(cleanCode);
  if (!existing) {
    throw AppError.notFound(`ไม่พบเครื่องจักรหมายเลขรหัส ${cleanCode}`);
  }

  const updated = repo.updateMachineRunHours(cleanCode, {
    runHours: payload.runHours,
    pmIntervalHours: payload.pmIntervalHours,
  });
  const dto = mapMachineDto(updated);
  return {
    ...dto,
    data: dto,
  };
}

/**
 * POST /api/maintenance
 * บันทึกงานซ่อม/PM แบบ Transaction เดียว (MNT-2):
 * 1) ตรวจว่ามีเครื่องจักรจริง
 * 2) ถ้ามีการเบิกอะไหล่ (spareSku + spareQty > 0):
 *    - ตรวจว่ามีอะไหล่ใน inventory_items และสต็อกเพียงพอ (ถ้าไม่พอโยน 400 BAD_REQUEST และ rollback ทั้งหมด)
 *    - ตัดสต็อกอะไหล่ + บันทึก stock_movements (reason = 'maintenance_use')
 * 3) บันทึกแถวลง maintenance_logs
 * 4) ถ้า type === 'pm' ให้รีเซ็ต run_hours = 0 และอัปเดต last_pm_date = performedDate พร้อมคืนสถานะ available
 */
export function createMaintenanceLog(payload, actorId = null) {
  const machineCode = String(payload.machineCode || '').trim();
  const performedDate = payload.performedDate || new Date().toISOString().slice(0, 10);
  const type = payload.type;
  const action = String(payload.action || '').trim();
  const technician = payload.technician?.trim() || null;
  const costSat = Math.max(0, Math.trunc(Number(payload.costSat ?? 0)));
  const spareSku = payload.spareSku?.trim() || null;
  const spareQty =
    spareSku && payload.spareQty !== undefined && payload.spareQty !== null
      ? Math.max(0, Math.trunc(Number(payload.spareQty)))
      : 0;

  return repo.runInTransaction(() => {
    const machine = repo.findMachineByCode(machineCode);
    if (!machine) {
      throw AppError.notFound(`ไม่พบเครื่องจักรหมายเลขรหัส ${machineCode}`);
    }

    let spareMovement = null;
    if (spareSku && spareQty > 0) {
      const spareItem = inventoryRepo.findInventoryItemBySku(spareSku);
      if (!spareItem) {
        throw AppError.notFound(`ไม่พบรหัสอะไหล่ [${spareSku}] ในคลังสินค้า`);
      }

      const currentStock = Number(spareItem.stock ?? 0);
      if (currentStock < spareQty) {
        throw AppError.badRequest(
          `สต็อกอะไหล่ [${spareSku}] ไม่เพียงพอสำหรับงานซ่อม: ต้องการ ${spareQty} ${spareItem.unit} แต่มีคงเหลือ ${currentStock} ${spareItem.unit}`,
          [
            {
              field: 'spareQty',
              sku: spareSku,
              required: spareQty,
              available: currentStock,
              issue: `อะไหล่ ${spareSku} คงเหลือ ${currentStock} ไม่พอเบิก ${spareQty}`,
            },
          ],
        );
      }
    }

    const logId = repo.insertMaintenanceLog({
      machineCode,
      performedDate,
      type,
      action,
      technician,
      costSat,
      spareSku: spareSku && spareQty > 0 ? spareSku : null,
      spareQty: spareSku && spareQty > 0 ? spareQty : null,
      status: 'done',
    });

    if (spareSku && spareQty > 0) {
      inventoryRepo.changeInventoryStockByDelta(spareSku, -spareQty);
      const movId = inventoryRepo.insertStockMovement({
        sku: spareSku,
        qtyChange: -spareQty,
        reason: 'maintenance_use',
        refType: 'maintenance_log',
        refId: String(logId),
        performedBy: actorId,
      });

      const updatedSpare = inventoryRepo.findInventoryItemBySku(spareSku);
      spareMovement = {
        movementId: movId,
        sku: spareSku,
        qtyUsed: spareQty,
        remainingStock: Number(updatedSpare?.stock ?? 0),
      };
    }

    if (type === 'pm') {
      repo.resetMachinePmHours(machineCode, performedDate, machine.linked_asset_id);
    }

    const createdLog = mapMaintenanceLogDto(repo.findMaintenanceLogById(logId));
    const updatedMachine = mapMachineDto(repo.findMachineByCode(machineCode));

    return {
      ...createdLog,
      machine: updatedMachine,
      spareMovement,
      data: {
        ...createdLog,
        machine: updatedMachine,
        spareMovement,
      },
    };
  });
}

export function listMaintenanceLogs(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;

  const { rows, total } = repo.listMaintenanceLogs({
    offset,
    limit,
    machineCode: (query.machineCode ?? '').trim(),
    dateFrom: (query.dateFrom ?? '').trim(),
    dateTo: (query.dateTo ?? '').trim(),
  });

  const data = rows.map(mapMaintenanceLogDto);
  return {
    data,
    items: data,
    logs: data,
    total,
    meta: computePaginationMeta(page, limit, total),
  };
}
