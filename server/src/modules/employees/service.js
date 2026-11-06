import { AppError } from '../../utils/errors.js';
import { seedDefaultTmsResources } from '../tms/service.js';
import * as repo from './repo.js';

/**
 * คำนวณจำนวนวันที่เหลือจนถึงวันหมดอายุใบขับขี่เทียบกับวันที่อ้างอิง (asOfDate)
 */
export function calculateDaysUntilExpiry(expiryDateStr, asOfDateStr) {
  if (!expiryDateStr) return null;
  const expMs = Date.parse(`${String(expiryDateStr).trim()}T00:00:00Z`);
  const asOfIso = asOfDateStr || new Date().toISOString().slice(0, 10);
  const asOfMs = Date.parse(`${String(asOfIso).trim()}T00:00:00Z`);
  if (!Number.isFinite(expMs) || !Number.isFinite(asOfMs)) return null;
  return Math.round((expMs - asOfMs) / (24 * 60 * 60 * 1000));
}

export function mapEmployeeDto(row, asOfDateStr) {
  if (!row) return null;
  const daysUntilLicenseExpiry = calculateDaysUntilExpiry(
    row.driver_license_expiry,
    asOfDateStr,
  );

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nickname: row.nickname ?? null,
    gender: row.gender ?? null,
    position: row.position ?? null,
    department: row.department ?? null,
    phone: row.phone ?? null,
    idCard: row.id_card ?? null,
    id_card: row.id_card ?? null,
    startDate: row.start_date ?? null,
    start_date: row.start_date ?? null,
    salaryType: row.salary_type ?? 'monthly',
    salary_type: row.salary_type ?? 'monthly',
    salarySat: Number(row.salary_sat ?? 0),
    salary_sat: Number(row.salary_sat ?? 0),
    driverLicense: row.driver_license ?? null,
    driver_license: row.driver_license ?? null,
    driverLicenseExpiry: row.driver_license_expiry ?? null,
    driver_license_expiry: row.driver_license_expiry ?? null,
    daysUntilLicenseExpiry,
    username: row.username ?? null,
    isActive: Number(row.is_active ?? 1) === 1,
    is_active: Number(row.is_active ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listEmployees(query = {}) {
  let allRows = repo.listEmployees();
  if (allRows.length === 0) {
    seedDefaultTmsResources();
    allRows = repo.listEmployees();
  }

  let isActiveFilter;
  if (query.active === 'all') {
    isActiveFilter = undefined;
  } else if (query.active === '0' || query.active === 'false') {
    isActiveFilter = false;
  } else if (query.active === '1' || query.active === 'true') {
    isActiveFilter = true;
  }

  const rows = repo.listEmployees({
    isActive: isActiveFilter,
    department: (query.department ?? '').trim(),
  });

  const data = rows.map((r) => mapEmployeeDto(r));
  return {
    data,
    items: data,
    employees: data,
    drivers: data,
    total: data.length,
  };
}

/**
 * GET /api/employees/license-expiring?days=30
 * คืนรายการพนักงานที่ active และมีใบขับขี่หมดอายุแล้วหรือกำลังจะหมดภายใน N วันข้างหน้า (EMP-1)
 */
export function listLicenseExpiringEmployees(query = {}) {
  const days = Math.max(1, Math.trunc(Number(query.days ?? 30)));
  const asOf = query.asOf || new Date().toISOString().slice(0, 10);

  const activeRows = repo.listEmployees({ isActive: true });
  const expiring = activeRows
    .map((r) => mapEmployeeDto(r, asOf))
    .filter(
      (emp) =>
        emp.driverLicenseExpiry !== null &&
        emp.daysUntilLicenseExpiry !== null &&
        emp.daysUntilLicenseExpiry <= days,
    )
    .sort((a, b) => (a.daysUntilLicenseExpiry ?? 0) - (b.daysUntilLicenseExpiry ?? 0));

  return {
    daysThreshold: days,
    asOf,
    totalExpiring: expiring.length,
    total: expiring.length,
    items: expiring,
    data: expiring,
    employees: expiring,
  };
}

export function getEmployeeById(id) {
  const row = repo.findEmployeeById(id);
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลพนักงานที่ระบุ');
  }
  const dto = mapEmployeeDto(row);
  return {
    ...dto,
    data: dto,
  };
}

export function createEmployee(payload) {
  let code = (payload.code ?? '').trim();
  if (!code) {
    const seq = repo.getNextEmployeeSequence();
    code = `EMP-${String(seq).padStart(3, '0')}`;
  } else if (repo.findEmployeeByCode(code)) {
    throw AppError.conflict(`รหัสพนักงาน [${code}] มีอยู่ในระบบแล้ว`);
  }

  const id = repo.insertEmployee({
    code,
    name: payload.name.trim(),
    nickname: payload.nickname ?? null,
    gender: payload.gender ?? null,
    position: payload.position ?? null,
    department: payload.department ?? null,
    phone: payload.phone ?? null,
    idCard: payload.idCard ?? null,
    startDate: payload.startDate ?? new Date().toISOString().slice(0, 10),
    salaryType: payload.salaryType ?? 'monthly',
    salarySat: payload.salarySat ?? 0,
    driverLicense: payload.driverLicense ?? null,
    driverLicenseExpiry: payload.driverLicenseExpiry ?? null,
    username: payload.username ?? null,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  });

  return getEmployeeById(id);
}

export function updateEmployee(id, payload) {
  const existing = repo.findEmployeeById(id);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลพนักงานที่ต้องการแก้ไข');
  }

  repo.updateEmployeeById(id, {
    name: payload.name,
    nickname: payload.nickname,
    gender: payload.gender,
    position: payload.position,
    department: payload.department,
    phone: payload.phone,
    id_card: payload.idCard,
    start_date: payload.startDate,
    salary_type: payload.salaryType,
    salary_sat: payload.salarySat,
    driver_license: payload.driverLicense,
    driver_license_expiry: payload.driverLicenseExpiry,
    username: payload.username,
    is_active:
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : undefined,
  });

  return getEmployeeById(id);
}

export function deactivateEmployee(id) {
  const existing = repo.findEmployeeById(id);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลพนักงานที่ระบุ');
  }
  repo.updateEmployeeById(id, { is_active: 0 });
  return getEmployeeById(id);
}
