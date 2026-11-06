import { AppError } from '../../utils/errors.js';
import { satangToBaht } from '../../utils/money.js';
import * as repo from './repo.js';

/**
 * คำนวณจำนวนปีเต็มที่ผ่านไประหว่างวันที่ซื้อ (acquisitionDate) กับวันที่อ้างอิง (asOfDate)
 * ตามสเปก AST-2: "เศษเดือนคิดเป็นเสีย ๆ ง่าย: ปีเต็ม"
 */
export function calculateElapsedFullYears(acquisitionDateStr, asOfDateStr) {
  if (!acquisitionDateStr) return 0;
  const acqParts = String(acquisitionDateStr).trim().split('-').map(Number);
  const asOfParts = String(asOfDateStr || new Date().toISOString().slice(0, 10))
    .trim()
    .split('-')
    .map(Number);

  if (acqParts.length < 3 || asOfParts.length < 3) return 0;
  const [acqY, acqM, acqD] = acqParts;
  const [asY, asM, asD] = asOfParts;

  let fullYears = asY - acqY;
  if (asM < acqM || (asM === acqM && asD < acqD)) {
    fullYears -= 1;
  }
  return Math.max(0, fullYears);
}

/**
 * Pure helper คำนวณค่าเสื่อมราคาแบบเส้นตรง (Straight-Line Depreciation — AST-2)
 * - depPerYearSat = Math.round(Math.max(0, costSat - salvageValueSat) / usefulLifeYears)
 * - accumulatedDepSat = Math.min(elapsedYears * depPerYearSat, Math.max(0, costSat - salvageValueSat))
 * - netBookValueSat = Math.max(0, costSat - accumulatedDepSat)
 */
export function calculateStraightLineDepreciation({
  costSat,
  salvageValueSat = 0,
  usefulLifeYears = 5,
  acquisitionDate,
  asOfDate,
}) {
  const cost = Math.max(0, Math.trunc(Number(costSat ?? 0)));
  const salvage = Math.max(0, Math.trunc(Number(salvageValueSat ?? 0)));
  const lifeYears = Math.max(1, Math.trunc(Number(usefulLifeYears || 5)));
  const depreciableBaseSat = Math.max(0, cost - salvage);
  const depreciationPerYearSat = Math.round(depreciableBaseSat / lifeYears);

  const resolvedAsOf = asOfDate || new Date().toISOString().slice(0, 10);
  const elapsedYears = calculateElapsedFullYears(acquisitionDate, resolvedAsOf);

  const accumulatedDepreciationSat = Math.min(
    elapsedYears * depreciationPerYearSat,
    depreciableBaseSat,
  );
  const netBookValueSat = Math.max(0, cost - accumulatedDepreciationSat);

  return {
    asOfDate: resolvedAsOf,
    acquisitionDate: acquisitionDate ?? null,
    costSat: cost,
    costBaht: satangToBaht(cost),
    salvageValueSat: salvage,
    salvageValueBaht: satangToBaht(salvage),
    depreciableBaseSat,
    usefulLifeYears: lifeYears,
    elapsedYears,
    depreciationPerYearSat,
    depreciationPerYearBaht: satangToBaht(depreciationPerYearSat),
    accumulatedDepreciationSat,
    accumulatedDepreciationBaht: satangToBaht(accumulatedDepreciationSat),
    netBookValueSat,
    netBookValueBaht: satangToBaht(netBookValueSat),
  };
}

export function mapAssetDto(row, asOfDate) {
  if (!row) return null;
  const calc = calculateStraightLineDepreciation({
    costSat: row.cost_sat,
    salvageValueSat: row.salvage_value_sat,
    usefulLifeYears: row.useful_life_years || 5,
    acquisitionDate: row.acquisition_date,
    asOfDate,
  });

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category ?? 'general',
    categoryName: row.category_name ?? null,
    brand: row.brand ?? null,
    model: row.model ?? null,
    serialNo: row.serial_no ?? null,
    location: row.location ?? null,
    acquisitionDate: row.acquisition_date ?? null,
    acquisition_date: row.acquisition_date ?? null,
    costSat: Number(row.cost_sat ?? 0),
    cost_sat: Number(row.cost_sat ?? 0),
    usefulLifeYears: Number(row.useful_life_years ?? 5),
    useful_life_years: Number(row.useful_life_years ?? 5),
    salvageValueSat: Number(row.salvage_value_sat ?? 0),
    salvage_value_sat: Number(row.salvage_value_sat ?? 0),
    depreciationPerYearSat: calc.depreciationPerYearSat,
    depreciation_per_year_sat: calc.depreciationPerYearSat,
    accumulatedDepreciationSat: calc.accumulatedDepreciationSat,
    accumulated_dep_sat: calc.accumulatedDepreciationSat,
    netBookValueSat: calc.netBookValueSat,
    net_book_value_sat: calc.netBookValueSat,
    elapsedYears: calc.elapsedYears,
    assignedEmployeeId: row.assigned_employee_id ?? null,
    assigned_employee_id: row.assigned_employee_id ?? null,
    assignedEmployeeCode: row.assigned_employee_code ?? null,
    assignedEmployeeName: row.assigned_employee_name ?? null,
    status: row.status,
    isActive: Number(row.is_active ?? 1) === 1,
    is_active: Number(row.is_active ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateAssignedEmployeeIsActive(assignedEmployeeId) {
  if (assignedEmployeeId === undefined || assignedEmployeeId === null) return;
  const emp = repo.findEmployeeById(assignedEmployeeId);
  if (!emp) {
    throw AppError.notFound(`ไม่พบพนักงานรหัส ID ${assignedEmployeeId}`);
  }
  if (Number(emp.is_active ?? 1) !== 1) {
    throw AppError.badRequest(
      `พนักงาน [${emp.code}] ${emp.name} มีสถานะพ้นสภาพ/ไม่ใช้งาน (inactive) ไม่สามารถเลือกเป็นผู้รับผิดชอบสินทรัพย์ได้ (EMP-2)`,
    );
  }
}

export function listAssets(query = {}) {
  const rows = repo.listAssets({
    category: (query.category ?? '').trim(),
    status: (query.status ?? '').trim(),
    includeRetired: query.includeRetired !== undefined ? Boolean(query.includeRetired) : true,
  });
  const data = rows.map((r) => mapAssetDto(r));
  return {
    data,
    items: data,
    assets: data,
    total: data.length,
  };
}

export function getAssetById(id) {
  const row = repo.findAssetById(id);
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลสินทรัพย์ที่ระบุ');
  }
  const dto = mapAssetDto(row);
  return {
    ...dto,
    data: dto,
  };
}

export function getAssetDepreciation(id, query = {}) {
  const row = repo.findAssetById(id);
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลสินทรัพย์ที่ระบุ');
  }

  const calc = calculateStraightLineDepreciation({
    costSat: row.cost_sat,
    salvageValueSat: row.salvage_value_sat,
    usefulLifeYears: row.useful_life_years || 5,
    acquisitionDate: row.acquisition_date,
    asOfDate: query.asOf,
  });

  const assetDto = mapAssetDto(row, query.asOf);
  return {
    assetId: row.id,
    code: row.code,
    name: row.name,
    ...calc,
    asset: assetDto,
    data: {
      assetId: row.id,
      code: row.code,
      name: row.name,
      ...calc,
    },
  };
}

export function createAsset(payload) {
  validateAssignedEmployeeIsActive(payload.assignedEmployeeId);

  let code = (payload.code ?? '').trim();
  if (!code) {
    const seq = repo.getNextAssetSequence();
    code = `AST-${String(seq).padStart(3, '0')}`;
  } else if (repo.findAssetByCode(code)) {
    throw AppError.conflict(`รหัสสินทรัพย์ [${code}] มีอยู่ในระบบแล้ว`);
  }

  const costSat = Math.max(0, Math.trunc(Number(payload.costSat ?? 0)));
  const salvageValueSat = Math.max(0, Math.trunc(Number(payload.salvageValueSat ?? 0)));
  if (salvageValueSat > costSat) {
    throw AppError.badRequest('มูลค่าซาก (salvageValueSat) ต้องไม่เกินราคาทุน (costSat)');
  }

  const usefulLifeYears = Math.max(1, Math.trunc(Number(payload.usefulLifeYears ?? 5)));
  const acquisitionDate = payload.acquisitionDate || new Date().toISOString().slice(0, 10);

  const calc = calculateStraightLineDepreciation({
    costSat,
    salvageValueSat,
    usefulLifeYears,
    acquisitionDate,
  });

  const status = payload.status || 'in_use';
  const isActive = status === 'retired' ? 0 : 1;

  const id = repo.insertAsset({
    code,
    name: payload.name.trim(),
    category: payload.category || 'general',
    categoryName: payload.categoryName ?? null,
    brand: payload.brand ?? null,
    model: payload.model ?? null,
    serialNo: payload.serialNo ?? null,
    location: payload.location ?? null,
    acquisitionDate,
    costSat,
    usefulLifeYears,
    salvageValueSat,
    depreciationPerYearSat: calc.depreciationPerYearSat,
    accumulatedDepSat: calc.accumulatedDepreciationSat,
    assignedEmployeeId: payload.assignedEmployeeId ?? null,
    status,
    isActive,
  });

  return getAssetById(id);
}

export function updateAsset(id, payload) {
  const existing = repo.findAssetById(id);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลสินทรัพย์ที่ต้องการแก้ไข');
  }

  if (
    payload.assignedEmployeeId !== undefined &&
    payload.assignedEmployeeId !== existing.assigned_employee_id
  ) {
    validateAssignedEmployeeIsActive(payload.assignedEmployeeId);
  }

  const costSat =
    payload.costSat !== undefined ? Math.trunc(Number(payload.costSat)) : Number(existing.cost_sat);
  const salvageValueSat =
    payload.salvageValueSat !== undefined
      ? Math.trunc(Number(payload.salvageValueSat))
      : Number(existing.salvage_value_sat ?? 0);
  const usefulLifeYears =
    payload.usefulLifeYears !== undefined
      ? Math.max(1, Math.trunc(Number(payload.usefulLifeYears)))
      : Number(existing.useful_life_years ?? 5);
  const acquisitionDate =
    payload.acquisitionDate !== undefined ? payload.acquisitionDate : existing.acquisition_date;

  if (salvageValueSat > costSat) {
    throw AppError.badRequest('มูลค่าซาก (salvageValueSat) ต้องไม่เกินราคาทุน (costSat)');
  }

  const calc = calculateStraightLineDepreciation({
    costSat,
    salvageValueSat,
    usefulLifeYears,
    acquisitionDate,
  });

  const targetStatus = payload.status !== undefined ? payload.status : existing.status;
  const targetIsActive =
    targetStatus === 'retired'
      ? 0
      : payload.isActive !== undefined
        ? payload.isActive
          ? 1
          : 0
        : Number(existing.is_active ?? 1);

  repo.updateAssetById(id, {
    name: payload.name,
    category: payload.category,
    category_name: payload.categoryName,
    brand: payload.brand,
    model: payload.model,
    serial_no: payload.serialNo,
    location: payload.location,
    acquisition_date: acquisitionDate,
    cost_sat: costSat,
    useful_life_years: usefulLifeYears,
    salvage_value_sat: salvageValueSat,
    depreciation_per_year_sat: calc.depreciationPerYearSat,
    accumulated_dep_sat: calc.accumulatedDepreciationSat,
    assigned_employee_id: payload.assignedEmployeeId,
    status: targetStatus,
    is_active: targetIsActive,
  });

  return getAssetById(id);
}

export function retireAsset(id) {
  const existing = repo.findAssetById(id);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลสินทรัพย์ที่ต้องการปลดระวาง');
  }
  repo.updateAssetById(id, {
    status: 'retired',
    is_active: 0,
  });
  return getAssetById(id);
}
