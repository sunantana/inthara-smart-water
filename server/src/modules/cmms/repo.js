import { getDb } from '../../db/connection.js';

export const DEFAULT_SEED_MACHINES = [
  {
    code: 'ITR-RO-001',
    name: 'เครื่องกรองน้ำ RO พร้อมปั๊มแรงดันสูง (RO Pump & Membrane)',
    category: 'ระบบผลิตน้ำ',
    brand: 'LEO',
    model: 'WTRm 2-22',
    watts: 2200,
    capacity: '2,000 ลิตร/ชม.',
    status: 'available',
    run_hours: 1850,
    pm_interval_hours: 2000,
    last_pm_date: '2026-09-15',
    assetCode: 'AST-MCH-001',
    assetCostSat: 12000000,
  },
  {
    code: 'ITR-FH-001',
    name: 'หัววาล์วออโต้ ถังกรองแมงกานีส & คาร์บอน',
    category: 'ระบบผลิตน้ำ',
    brand: 'Auto Valve',
    model: 'FRP-MnAC',
    watts: 48,
    capacity: 'ดักสนิม/กลิ่น/คลอรีน',
    status: 'available',
    run_hours: 155,
    pm_interval_hours: 168,
    last_pm_date: '2026-10-20',
    assetCode: 'AST-MCH-002',
    assetCostSat: 4500000,
  },
  {
    code: 'ITR-UV-001',
    name: 'เครื่องผลิตแสงยูวี & โอโซนฆ่าเชื้อ (UV & Ozonation Sterilizer)',
    category: 'ระบบฆ่าเชื้อ',
    brand: 'Aquapro',
    model: 'UV-40W-OZ',
    watts: 120,
    capacity: '36-40 W',
    status: 'available',
    run_hours: 4200,
    pm_interval_hours: 8000,
    last_pm_date: '2026-08-01',
    assetCode: 'AST-MCH-003',
    assetCostSat: 2800000,
  },
  {
    code: 'ITR-WE-001',
    name: 'เครื่องล้างถังน้ำดื่ม 18.9 ลิตร (ภายใน/ภายนอกอัตโนมัติ)',
    category: 'ระบบล้างทำความสะอาด',
    brand: 'Inthara Tech',
    model: 'WE-WI-1500',
    watts: 1500,
    capacity: '120 ถัง/ชม.',
    status: 'available',
    run_hours: 310,
    pm_interval_hours: 500,
    last_pm_date: '2026-10-12',
    assetCode: 'AST-MCH-004',
    assetCostSat: 6500000,
  },
  {
    code: 'ITR-CS-002',
    name: 'เครื่องปิดผนึกซีลด้วยไอน้ำ (Steam Shrink Seal)',
    category: 'ระบบบรรจุและปิดผนึก',
    brand: 'Inthara Tech',
    model: 'CS-2000B',
    watts: 2000,
    capacity: 'ซีลฝาถังและคอขวด',
    status: 'available',
    run_hours: 340,
    pm_interval_hours: 500,
    last_pm_date: '2026-10-15',
    assetCode: 'AST-MCH-005',
    assetCostSat: 3500000,
  },
];

export function runInTransaction(fn) {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx();
}

export function upsertSeedMachineWithAsset(m) {
  const db = getDb();

  let assetRow = db.prepare(`SELECT id FROM assets WHERE code = ?`).get(m.assetCode);
  if (!assetRow) {
    const assetRes = db
      .prepare(
        `INSERT INTO assets (
           code, name, category, category_name, brand, model, location,
           acquisition_date, cost_sat, useful_life_years, salvage_value_sat,
           depreciation_per_year_sat, status, is_active
         ) VALUES (?, ?, 'machine', 'เครื่องจักรการผลิต', ?, ?, 'อาคารผลิตน้ำดื่มอินธารา', '2025-01-01', ?, 5, 0, ?, 'in_use', 1)`,
      )
      .run(
        m.assetCode,
        m.name,
        m.brand ?? null,
        m.model ?? null,
        Number(m.assetCostSat ?? 5000000),
        Math.round(Number(m.assetCostSat ?? 5000000) / 5),
      );
    assetRow = { id: Number(assetRes.lastInsertRowid) };
  }

  const existing = db.prepare(`SELECT id FROM machines WHERE code = ?`).get(m.code);
  if (existing) {
    db.prepare(
      `UPDATE machines
       SET name = ?, category = ?, brand = ?, model = ?, watts = ?, capacity = ?,
           linked_asset_id = COALESCE(linked_asset_id, ?), updated_at = datetime('now')
       WHERE code = ?`,
    ).run(
      m.name,
      m.category,
      m.brand,
      m.model,
      m.watts,
      m.capacity,
      assetRow.id,
      m.code,
    );
    return { id: Number(existing.id), code: m.code, linkedAssetId: assetRow.id, action: 'kept' };
  }

  const res = db
    .prepare(
      `INSERT INTO machines (
         code, name, category, brand, model, watts, capacity,
         status, run_hours, pm_interval_hours, last_pm_date, linked_asset_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      m.code,
      m.name,
      m.category,
      m.brand,
      m.model,
      m.watts,
      m.capacity,
      m.status,
      m.run_hours,
      m.pm_interval_hours,
      m.last_pm_date,
      assetRow.id,
    );

  return { id: Number(res.lastInsertRowid), code: m.code, linkedAssetId: assetRow.id, action: 'created' };
}

export function listMachines() {
  return getDb()
    .prepare(
      `SELECT m.*,
              a.code AS linked_asset_code,
              a.status AS linked_asset_status
       FROM machines m
       LEFT JOIN assets a ON a.id = m.linked_asset_id
       ORDER BY m.id ASC`,
    )
    .all();
}

export function findMachineByCode(code) {
  return (
    getDb()
      .prepare(
        `SELECT m.*,
                a.code AS linked_asset_code,
                a.status AS linked_asset_status
         FROM machines m
         LEFT JOIN assets a ON a.id = m.linked_asset_id
         WHERE m.code = ?`,
      )
      .get(String(code || '').trim()) ?? null
  );
}

export function updateMachineStatusAndSyncAsset(code, newStatus) {
  const db = getDb();
  const machine = findMachineByCode(code);
  if (!machine) return null;

  db.prepare(
    `UPDATE machines
     SET status = ?, updated_at = datetime('now')
     WHERE code = ?`,
  ).run(newStatus, machine.code);

  // Event-driven sync กับ assets ที่ผูกไว้ (MNT-4: ทำครั้งเดียวตอนเปลี่ยนสถานะ ไม่วนลูปทุก request)
  if (machine.linked_asset_id) {
    const assetTargetStatus = newStatus === 'maintenance' ? 'maintenance' : 'in_use';
    db.prepare(
      `UPDATE assets
       SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND status != 'retired'`,
    ).run(assetTargetStatus, machine.linked_asset_id);
  }

  return findMachineByCode(machine.code);
}

export function updateMachineRunHours(code, { runHours, pmIntervalHours }) {
  const db = getDb();
  if (pmIntervalHours !== undefined && pmIntervalHours !== null) {
    db.prepare(
      `UPDATE machines
       SET run_hours = ?, pm_interval_hours = ?, updated_at = datetime('now')
       WHERE code = ?`,
    ).run(Number(runHours), Number(pmIntervalHours), code);
  } else {
    db.prepare(
      `UPDATE machines
       SET run_hours = ?, updated_at = datetime('now')
       WHERE code = ?`,
    ).run(Number(runHours), code);
  }
  return findMachineByCode(code);
}

export function resetMachinePmHours(code, performedDate, linkedAssetId = null) {
  const db = getDb();
  db.prepare(
    `UPDATE machines
     SET run_hours = 0,
         last_pm_date = ?,
         status = 'available',
         updated_at = datetime('now')
     WHERE code = ?`,
  ).run(performedDate, code);

  if (linkedAssetId) {
    db.prepare(
      `UPDATE assets
       SET status = 'in_use', updated_at = datetime('now')
       WHERE id = ? AND status != 'retired'`,
    ).run(Number(linkedAssetId));
  }
}

export function insertMaintenanceLog({
  machineCode,
  performedDate,
  type,
  action,
  technician = null,
  costSat = 0,
  spareSku = null,
  spareQty = null,
  status = 'done',
}) {
  const res = getDb()
    .prepare(
      `INSERT INTO maintenance_logs (
         machine_code, performed_date, type, action, technician,
         cost_sat, spare_sku, spare_qty, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      machineCode,
      performedDate,
      type,
      action,
      technician ?? null,
      Number(costSat ?? 0),
      spareSku ?? null,
      spareQty ?? null,
      status,
    );
  return Number(res.lastInsertRowid);
}

export function findMaintenanceLogById(id) {
  return (
    getDb()
      .prepare(
        `SELECT ml.*,
                m.name AS machine_name,
                i.name AS spare_name,
                i.unit AS spare_unit
         FROM maintenance_logs ml
         LEFT JOIN machines m ON m.code = ml.machine_code
         LEFT JOIN inventory_items i ON i.sku = ml.spare_sku
         WHERE ml.id = ?`,
      )
      .get(Number(id)) ?? null
  );
}

export function listMaintenanceLogs({
  offset = 0,
  limit = 50,
  machineCode = '',
  dateFrom = '',
  dateTo = '',
} = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (machineCode) {
    clauses.push('ml.machine_code = ?');
    params.push(machineCode);
  }
  if (dateFrom) {
    clauses.push('ml.performed_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    clauses.push('ml.performed_date <= ?');
    params.push(dateTo);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM maintenance_logs ml ${whereSql}`)
    .get(...params);
  const total = Number(totalRow?.cnt ?? 0);

  const rows = db
    .prepare(
      `SELECT ml.*,
              m.name AS machine_name,
              i.name AS spare_name,
              i.unit AS spare_unit
       FROM maintenance_logs ml
       LEFT JOIN machines m ON m.code = ml.machine_code
       LEFT JOIN inventory_items i ON i.sku = ml.spare_sku
       ${whereSql}
       ORDER BY ml.performed_date DESC, ml.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total };
}
