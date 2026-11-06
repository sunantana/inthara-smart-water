import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashSecret } from '../../src/modules/auth/service.js';
import { seedDefaultInventoryItems } from '../../src/modules/inventory/service.js';
import { seedDefaultTmsResources } from '../../src/modules/tms/service.js';
import { seedDefaultCmmsResources } from '../../src/modules/cmms/service.js';
import { calculateStraightLineDepreciation } from '../../src/modules/assets/service.js';

describe('Phase 8 — CMMS, Assets, Employees & Expenses Integration & Unit Tests', () => {
  const app = createApp();
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let driverToken = '';

  beforeAll(async () => {
    runMigrations();
    const db = getDb();

    const users = [
      { username: 'p8_admin', name: 'P8 Admin', role: 'admin', pass: 'AdminPass-99' },
      { username: 'p8_manager', name: 'P8 Manager', role: 'manager', pass: 'ManagerPass-99' },
      { username: 'p8_staff', name: 'P8 Staff', role: 'staff', pass: 'StaffPass-99' },
      { username: 'p8_driver', name: 'P8 Driver', role: 'driver', pass: 'DriverPass-99' },
    ];

    for (const u of users) {
      const hash = hashSecret(u.pass);
      const pinHash = hashSecret('123456');
      db.prepare(
        `INSERT INTO users (username, display_name, role, password_hash, pin, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(username) DO UPDATE SET
           role = excluded.role,
           password_hash = excluded.password_hash,
           is_active = 1,
           failed_attempts = 0,
           lock_until = NULL`,
      ).run(u.username, u.name, u.role, hash, pinHash);
    }

    const loginAs = async (username, password) => {
      const res = await request(app).post('/api/auth/login').send({ username, password });
      expect(res.status).toBe(200);
      return res.body.accessToken;
    };

    adminToken = await loginAs('p8_admin', 'AdminPass-99');
    managerToken = await loginAs('p8_manager', 'ManagerPass-99');
    staffToken = await loginAs('p8_staff', 'StaffPass-99');
    driverToken = await loginAs('p8_driver', 'DriverPass-99');

    seedDefaultInventoryItems(
      {
        'FG-189L': 1000,
        'FG-350ML': 500,
        'FG-600ML': 500,
        'FG-1500ML': 500,
        'RET-189L-EMPTY': 200,
        'SP-FILTER-5U': 20,
        'SP-RO-MEMBRANE': 4,
      },
      { overwrite: true },
    );

    seedDefaultTmsResources();
    seedDefaultCmmsResources();
  });

  afterAll(() => {
    closeDb();
  });

  it('1) [MNT-2] บันทึกซ่อมที่ใช้ spare part 5 ชิ้น → maintenance_logs เกิด + สต็อกอะไหล่ลด 5 + stock_movements (reason=maintenance_use) เกิด', async () => {
    const db = getDb();
    const beforeSpare = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('SP-FILTER-5U');
    expect(Number(beforeSpare.stock)).toBe(20);

    const res = await request(app)
      .post('/api/maintenance')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        machineCode: 'ITR-UV-001',
        performedDate: '2026-11-06',
        type: 'repair',
        action: 'เปลี่ยนไส้กรอง 5 ไมครอน จำนวน 5 แท่ง',
        technician: 'ช่างสมศักดิ์',
        costSat: 150000, // 1,500 บาท
        spareSku: 'SP-FILTER-5U',
        spareQty: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.machineCode).toBe('ITR-UV-001');
    expect(res.body.spareSku).toBe('SP-FILTER-5U');
    expect(res.body.spareQty).toBe(5);
    expect(res.body.spareMovement.qtyUsed).toBe(5);
    expect(res.body.spareMovement.remainingStock).toBe(15);

    // ตรวจใน DB จริง
    const afterSpare = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('SP-FILTER-5U');
    expect(Number(afterSpare.stock)).toBe(15);

    const logRow = db
      .prepare('SELECT * FROM maintenance_logs WHERE id = ?')
      .get(res.body.id);
    expect(logRow).toBeTruthy();
    expect(logRow.machine_code).toBe('ITR-UV-001');
    expect(Number(logRow.spare_qty)).toBe(5);

    const movRow = db
      .prepare(
        `SELECT * FROM stock_movements
         WHERE ref_type = 'maintenance_log' AND ref_id = ? AND sku = 'SP-FILTER-5U'`,
      )
      .get(String(res.body.id));
    expect(movRow).toBeTruthy();
    expect(movRow.reason).toBe('maintenance_use');
    expect(Number(movRow.qty_change)).toBe(-5);
  });

  it('2) [MNT-2 Rollback] อะไหล่ไม่พอ → ตอบ 400 BAD_REQUEST + rollback ทั้งชุด (ไม่เกิด maintenance_logs และสต็อกไม่เปลี่ยน)', async () => {
    const db = getDb();
    const logsCountBefore = db
      .prepare('SELECT COUNT(*) AS cnt FROM maintenance_logs')
      .get().cnt;
    const stockBefore = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('SP-FILTER-5U').stock;

    const res = await request(app)
      .post('/api/maintenance')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        machineCode: 'ITR-UV-001',
        performedDate: '2026-11-06',
        type: 'repair',
        action: 'พยายามเบิกไส้กรองเกินสต็อกที่มี (ขอเบิก 999 แท่ง)',
        spareSku: 'SP-FILTER-5U',
        spareQty: 999,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const logsCountAfter = db
      .prepare('SELECT COUNT(*) AS cnt FROM maintenance_logs')
      .get().cnt;
    const stockAfter = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('SP-FILTER-5U').stock;

    expect(logsCountAfter).toBe(logsCountBefore);
    expect(stockAfter).toBe(stockBefore);
  });

  it('3) [MNT-3 & MNT-2] บันทึก PM เสร็จ (type = pm) → run_hours รีเซ็ตเป็น 0 + last_pm_date อัปเดต + เครื่องหลุดจาก GET /api/machines/due-pm', async () => {
    const db = getDb();
    // ตั้งให้เครื่อง ITR-FH-001 มี run_hours = 950 (ครบกำหนด PM)
    await request(app)
      .put('/api/machines/ITR-FH-001/hours')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ runHours: 950, pmIntervalHours: 1000 });

    const pmDate = '2026-11-06';
    const pmRes = await request(app)
      .post('/api/maintenance')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        machineCode: 'ITR-FH-001',
        performedDate: pmDate,
        type: 'pm',
        action: 'ทำ PM ประจำรอบ 1,000 ชม. เปลี่ยนชุดกรองและล้างระบบ',
        technician: 'ช่างสมศักดิ์',
        costSat: 50000,
      });
    expect(pmRes.status).toBe(201);
    expect(pmRes.body.machine.runHours).toBe(0);
    expect(pmRes.body.machine.lastPmDate).toBe(pmDate);
    expect(pmRes.body.machine.isDuePm).toBe(false);
    expect(pmRes.body.machine.status).toBe('available');

    // ยืนยันใน DB จริง
    const machineRow = db
      .prepare('SELECT run_hours, last_pm_date, status FROM machines WHERE code = ?')
      .get('ITR-FH-001');
    expect(Number(machineRow.run_hours)).toBe(0);
    expect(machineRow.last_pm_date).toBe(pmDate);
    expect(machineRow.status).toBe('available');

    // ยืนยันว่าหลุดจาก GET /api/machines/due-pm แล้ว
    const dueAfterRes = await request(app)
      .get('/api/machines/due-pm')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(dueAfterRes.status).toBe(200);
    const fhInDueAfter = dueAfterRes.body.data.find((m) => m.code === 'ITR-FH-001');
    expect(fhInDueAfter).toBeUndefined();
  });

  it('4) [MNT-3 & MNT-4] GET /api/machines/due-pm: ตั้ง run_hours >= 90% ของ pm_interval_hours เครื่องติดใน due-pm + ซิงค์สถานะสินทรัพย์', async () => {
    // 4.1) ทดสอบซิงค์สถานะเครื่องจักร available <-> maintenance กับสินทรัพย์ที่ผูกไว้ (MNT-4)
    const statusMaintRes = await request(app)
      .put('/api/machines/ITR-UV-001/status')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'maintenance' });
    expect(statusMaintRes.status).toBe(200);
    expect(statusMaintRes.body.status).toBe('maintenance');
    expect(statusMaintRes.body.linkedAssetStatus).toBe('maintenance');

    // 4.2) ตั้ง run_hours ของ ITR-UV-001 ให้ >= 90% ของ pm_interval_hours (เช่น 950 / 1000 ชม. = 95%)
    const setHoursRes = await request(app)
      .put('/api/machines/ITR-UV-001/hours')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ runHours: 950, pmIntervalHours: 1000 });
    expect(setHoursRes.status).toBe(200);
    expect(setHoursRes.body.isDuePm).toBe(true);
    expect(setHoursRes.body.pmProgressPct).toBe(95);

    const dueBeforeRes = await request(app)
      .get('/api/machines/due-pm')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(dueBeforeRes.status).toBe(200);
    const uvInDueBefore = dueBeforeRes.body.data.find((m) => m.code === 'ITR-UV-001');
    expect(uvInDueBefore).toBeTruthy();
    expect(uvInDueBefore.code).toBe('ITR-UV-001');
  });

  it('5) [AST-2 Unit + API] ค่าเสื่อมเส้นตรง: ทุน 100,000 บาท ซาก 10,000 บาท อายุ 5 ปี ใช้มา 2 ปี → เสื่อม 18,000/ปี, สะสม 36,000, สุทธิ 64,000 บาท', async () => {
    // Unit test ฟังก์ชันคำนวณโดยตรง
    const unitCalc = calculateStraightLineDepreciation({
      costSat: 10_000_000, // 100,000.00 บาท
      salvageValueSat: 1_000_000, // 10,000.00 บาท
      usefulLifeYears: 5,
      acquisitionDate: '2024-06-01',
      asOfDate: '2026-06-01', // ครบ 2 ปีเต็ม
    });

    expect(unitCalc.elapsedYears).toBe(2);
    expect(unitCalc.depreciationPerYearSat).toBe(1_800_000); // 18,000 บาท/ปี
    expect(unitCalc.depreciationPerYearBaht).toBe(18_000);
    expect(unitCalc.accumulatedDepreciationSat).toBe(3_600_000); // 36,000 บาท
    expect(unitCalc.accumulatedDepreciationBaht).toBe(36_000);
    expect(unitCalc.netBookValueSat).toBe(6_400_000); // 64,000 บาท
    expect(unitCalc.netBookValueBaht).toBe(64_000);

    // ทดสอบผ่าน API: สร้างสินทรัพย์แล้วเรียก GET /api/assets/:id/depreciation?asOf=2026-06-01
    const createRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'เครื่องบรรจุขวดอัตโนมัติ (ทดสอบค่าเสื่อม)',
        category: 'production',
        acquisitionDate: '2024-06-01',
        costSat: 10_000_000, // 100,000 บาท
        salvageValueSat: 1_000_000, // 10,000 บาท
        usefulLifeYears: 5,
      });
    expect(createRes.status).toBe(201);
    const assetId = createRes.body.id;

    const depRes = await request(app)
      .get(`/api/assets/${assetId}/depreciation?asOf=2026-06-01`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(depRes.status).toBe(200);
    expect(depRes.body.costSat).toBe(10_000_000);
    expect(depRes.body.salvageValueSat).toBe(1_000_000);
    expect(depRes.body.usefulLifeYears).toBe(5);
    expect(depRes.body.elapsedYears).toBe(2);
    expect(depRes.body.depreciationPerYearSat).toBe(1_800_000); // 18,000 บาท/ปี
    expect(depRes.body.accumulatedDepreciationSat).toBe(3_600_000); // 36,000 บาท
    expect(depRes.body.netBookValueSat).toBe(6_400_000); // 64,000 บาท
  });

  it('6) [EMP-1] GET /api/employees/license-expiring?days=30: วันหมดอายุ +25 วันติดในรายการ แต่ +45 วันไม่ติด', async () => {
    const now = new Date();
    const plus25 = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const plus45 = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const emp25Res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'นายสมหมาย ใกล้หมดอายุ (+25 วัน)',
        position: 'พนักงานขับรถ',
        driverLicense: 'DL-EXP-25D',
        driverLicenseExpiry: plus25,
      });
    expect(emp25Res.status).toBe(201);

    const emp45Res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'นายสมปอง ยังไม่หมดอายุ (+45 วัน)',
        position: 'พนักงานขับรถ',
        driverLicense: 'DL-EXP-45D',
        driverLicenseExpiry: plus45,
      });
    expect(emp45Res.status).toBe(201);

    const expRes = await request(app)
      .get('/api/employees/license-expiring?days=30')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(expRes.status).toBe(200);

    const idsInExpiring = expRes.body.data.map((e) => e.id);
    expect(idsInExpiring).toContain(emp25Res.body.id);
    expect(idsInExpiring).not.toContain(emp45Res.body.id);
  });

  it('7) [EMP-2] พนักงาน inactive ถูกเลือกเป็นคนขับใน POST /api/tms/trips หรือผู้รับผิดชอบสินทรัพย์ → ตอบ 400 BAD_REQUEST', async () => {
    // สร้างพนักงานแล้วสั่ง DELETE (soft deactivate -> is_active = 0)
    const empRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'นายพ้นสภาพ ทดสอบบล็อก',
        position: 'พนักงานขับรถ',
      });
    expect(empRes.status).toBe(201);
    const inactiveEmpId = empRes.body.id;

    const delRes = await request(app)
      .delete(`/api/employees/${inactiveEmpId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.isActive).toBe(false);

    // สร้างลูกค้า 1 รายเพื่อลองจัดทริป
    const custRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerType: 'shop',
        name: 'ร้านทดสอบจัดทริปคนขับพ้นสภาพ',
        phone: '089-000-1111',
        zone: 'โซนในเมือง',
        lat: 17.83,
        lng: 100.36,
      });
    expect(custRes.status).toBe(201);

    // 7.1) ลองเลือกพนักงาน inactive เป็นคนขับใน POST /api/tms/trips -> ต้องได้ 400 BAD_REQUEST
    const tripRes = await request(app)
      .post('/api/tms/trips')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        tripDate: '2026-11-06',
        driverId: inactiveEmpId,
        stops: [{ customerId: custRes.body.id, seq: 1 }],
      });
    expect(tripRes.status).toBe(400);
    expect(tripRes.body.error.code).toBe('VALIDATION_ERROR');

    // 7.2) ลองเลือกพนักงาน inactive เป็นผู้รับผิดชอบสินทรัพย์ใน POST /api/assets -> ต้องได้ 400 BAD_REQUEST
    const assetRes = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'สินทรัพย์ทดสอบผูกพนักงานพ้นสภาพ',
        costSat: 500000,
        usefulLifeYears: 5,
        assignedEmployeeId: inactiveEmpId,
      });
    expect(assetRes.status).toBe(400);
    expect(assetRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('8) [EXP-1 & EXP-2] ต้นทุนเที่ยวรถ: สร้างทริป + ผูกค่าใช้จ่าย (ref_type=trip, ref_id=tripId) → GET /api/expenses/costing/trips/:tripId คืน profitSat = revenueSat - fuelCostSat - extraExpensesSat ถูกต้อง', async () => {
    const db = getDb();
    const activeDriver = db
      .prepare('SELECT id FROM employees WHERE is_active = 1 LIMIT 1')
      .get();
    const vehicle = db.prepare('SELECT id FROM vehicles LIMIT 1').get();

    // สร้างลูกค้าและออเดอร์สำหรับทริปวันที่ 2026-11-18
    const tripDate = '2026-11-18';
    const custRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerType: 'shop',
        name: 'ร้านทดสอบต้นทุนทริป (EXP-2)',
        phone: '081-222-3333',
        zone: 'โซนในเมือง',
        lat: 17.85,
        lng: 100.37,
        prices: {
          'FG-189L': 2000, // 20 บาท
          'FG-350ML': 3500, // 35 บาท
          'FG-600ML': 3500,
          'FG-1500ML': 3500,
        },
      });
    expect(custRes.status).toBe(201);

    const ordRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: custRes.body.id,
        deliveryDate: tripDate,
        items: [
          { sku: 'FG-189L', qty: 30 }, // 30 * 2,000 = 60,000 sat (600 บาท)
          { sku: 'FG-350ML', qty: 20 }, // 20 * 3,500 = 70,000 sat (700 บาท) -> รวมรายได้ 130,000 sat (1,300 บาท)
        ],
      });
    expect(ordRes.status).toBe(201);

    // สร้างทริป
    const tripCreateRes = await request(app)
      .post('/api/tms/trips')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        tripDate,
        vehicleId: vehicle.id,
        driverId: activeDriver.id,
        stops: [{ customerId: custRes.body.id, seq: 1 }],
      });
    expect(tripCreateRes.status).toBe(201);
    const tripId = tripCreateRes.body.id;
    const expectedRevenueSat = tripCreateRes.body.totalRevenueSat;
    const expectedFuelCostSat = tripCreateRes.body.estimatedFuelCostSat;
    expect(expectedRevenueSat).toBe(130_000);
    expect(expectedFuelCostSat).toBeGreaterThan(0);

    // บันทึกค่าใช้จ่ายผูกกับทริปนี้ 2 รายการ:
    // 1) ค่าปะยางระหว่างทาง 200 บาท (20,000 สตางค์)
    // 2) ค่าน้ำแข็ง/เบี้ยเลี้ยงพิเศษ 150 บาท (15,000 สตางค์)
    // รวม extraExpensesSat = 35,000 สตางค์ (350 บาท)
    const exp1Res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        date: tripDate,
        category: 'repair',
        refType: 'trip',
        refId: String(tripId),
        description: 'ค่าปะยางรถขนส่งระหว่างทริป',
        amountSat: 20_000,
      });
    expect(exp1Res.status).toBe(201);

    const exp2Res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        date: tripDate,
        category: 'other',
        refType: 'trip',
        refId: String(tripId),
        description: 'ค่าเบี้ยเลี้ยง/ทางด่วนประจำทริป',
        amountSat: 15_000,
      });
    expect(exp2Res.status).toBe(201);

    // เรียก GET /api/expenses/costing/trips/:tripId
    const costingRes = await request(app)
      .get(`/api/expenses/costing/trips/${tripId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(costingRes.status).toBe(200);

    const c = costingRes.body;
    expect(c.tripId).toBe(tripId);
    expect(c.revenueSat).toBe(130_000);
    expect(c.fuelCostSat).toBe(expectedFuelCostSat);
    expect(c.extraExpensesSat).toBe(35_000);
    expect(c.totalCostSat).toBe(expectedFuelCostSat + 35_000);
    expect(c.profitSat).toBe(130_000 - expectedFuelCostSat - 35_000);
    expect(c.linkedExpenses).toHaveLength(2);
  });
});
