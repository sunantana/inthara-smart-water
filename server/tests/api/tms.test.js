import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashSecret } from '../../src/modules/auth/service.js';
import { seedDefaultInventoryItems } from '../../src/modules/inventory/service.js';
import { resetOrderDuplicateWindow } from '../../src/modules/orders/service.js';
import { seedDefaultTmsResources } from '../../src/modules/tms/service.js';
import { estimateFuelCostSat, haversineKm, roundKm } from '../../src/utils/geo.js';

describe('Phase 6 — TMS Route Planning & Trip Management Integration Tests', () => {
  const app = createApp();
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let driverToken = '';

  const TRIP_DATE = '2026-11-10';
  const ZONE_TEST = 'โซนในเมือง (TMS Test)';

  /** @type {Array<{ id: number, code: string, name: string, lat: number, lng: number }>} */
  const fiveCustomers = [];
  let vehicleSmallId = 0; // max 50 bottles 18.9L, fuelRate 5 km/L, diesel 4500 sat/L
  let vehicleLargeId = 0; // max 120 bottles 18.9L
  let driverEmpId = 0;

  beforeAll(async () => {
    runMigrations();
    const db = getDb();

    const users = [
      { username: 'p6_admin', name: 'P6 Admin', role: 'admin', pass: 'AdminPass-99' },
      { username: 'p6_manager', name: 'P6 Manager', role: 'manager', pass: 'ManagerPass-99' },
      { username: 'p6_staff', name: 'P6 Staff', role: 'staff', pass: 'StaffPass-99' },
      { username: 'p6_driver', name: 'P6 Driver', role: 'driver', pass: 'DriverPass-99' },
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

    adminToken = await loginAs('p6_admin', 'AdminPass-99');
    managerToken = await loginAs('p6_manager', 'ManagerPass-99');
    staffToken = await loginAs('p6_staff', 'StaffPass-99');
    driverToken = await loginAs('p6_driver', 'DriverPass-99');

    seedDefaultInventoryItems(
      {
        'FG-189L': 5000,
        'FG-350ML': 1000,
        'FG-600ML': 1000,
        'FG-1500ML': 1000,
        'RET-189L-EMPTY': 500,
      },
      { overwrite: true },
    );

    const seededTms = seedDefaultTmsResources();
    vehicleSmallId = seededTms.vehicles[0].id; // maxBottles189L = 50, fuelRate = 5, diesel = 4500
    vehicleLargeId = seededTms.vehicles[1].id; // maxBottles189L = 120
    driverEmpId = seededTms.drivers[0].id;

    // สร้างลูกค้า 5 รายที่มีพิกัดเรียงจากใกล้โรงงานไปไกลโรงงาน (ทางทิศเหนือ)
    // โรงงาน: lat 17.816882513503195, lng 100.36169257553256
    const coords = [
      { name: 'ร้าน TMS จุดที่ 1 (ใกล้สุด)', lat: 17.83, lng: 100.36169257553256 },
      { name: 'ร้าน TMS จุดที่ 2', lat: 17.85, lng: 100.36169257553256 },
      { name: 'ร้าน TMS จุดที่ 3', lat: 17.88, lng: 100.36169257553256 },
      { name: 'ร้าน TMS จุดที่ 4', lat: 17.92, lng: 100.36169257553256 },
      { name: 'ร้าน TMS จุดที่ 5 (ไกลสุด)', lat: 17.97, lng: 100.36169257553256 },
    ];

    for (const c of coords) {
      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: c.name,
          phone: '081-555-0000',
          zone: ZONE_TEST,
          address: 'อ.เมือง จ.อุตรดิตถ์',
          lat: c.lat,
          lng: c.lng,
          prices: {
            'FG-189L': 2000, // 20 บาท
            'FG-350ML': 3500, // 35 บาท
            'FG-600ML': 3500,
            'FG-1500ML': 3500,
          },
        });
      expect(custRes.status).toBe(201);
      fiveCustomers.push({
        id: custRes.body.id,
        code: custRes.body.code,
        name: custRes.body.name,
        lat: c.lat,
        lng: c.lng,
      });
    }

    // สร้างออเดอร์ในวัน TRIP_DATE ให้ลูกค้า 3 รายแรก (รายละ 15 ถัง 18.9L + 10 แพ็ค 350ml)
    // รวม 3 ราย = 45 ถัง 18.9L (90% ของรถคันที่ 1 ที่จุ 50 ถังพอดี!) และ 30 แพ็ค
    resetOrderDuplicateWindow();
    for (let i = 0; i < 3; i++) {
      const ordRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId: fiveCustomers[i].id,
          deliveryDate: TRIP_DATE,
          items: [
            { sku: 'FG-189L', qty: 15 },
            { sku: 'FG-350ML', qty: 10 },
          ],
        });
      expect(ordRes.status).toBe(201);
    }
  });

  afterAll(() => {
    closeDb();
  });

  it('1) GET /api/tms/plan และ GET /api/vehicles, /api/employees ดึงใบเส้นทางจาก route-sheet พร้อมพิกัดโรงงาน รถ และคนขับ', async () => {
    const vehRes = await request(app)
      .get('/api/vehicles')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(vehRes.status).toBe(200);
    expect(vehRes.body.data.length).toBeGreaterThanOrEqual(2);

    const empRes = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(empRes.status).toBe(200);
    expect(empRes.body.data.length).toBeGreaterThanOrEqual(2);

    const planRes = await request(app)
      .get(`/api/tms/plan?date=${TRIP_DATE}&zone=${encodeURIComponent(ZONE_TEST)}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(planRes.status).toBe(200);
    expect(planRes.body.factory.lat).toBeCloseTo(config.factoryLocation.lat, 6);
    expect(planRes.body.factory.lng).toBeCloseTo(config.factoryLocation.lng, 6);
    expect(planRes.body.stops).toHaveLength(3);
    expect(planRes.body.total189L).toBe(45);
    expect(planRes.body.totalPacks).toBe(30);
    // รายได้ต่อป้าย = 15*2000 + 10*3500 = 30000 + 35000 = 65000 สตางค์ -> 3 ป้าย = 195000 สตางค์
    expect(planRes.body.totalRevenueSat).toBe(195_000);
  });

  it('2) POST /api/tms/optimize เรียง 5 จุดที่มีพิกัดคงที่ด้วย Nearest-Neighbor และได้ระยะทางรวมตรงกับคำนวณมือ', async () => {
    // ส่ง 5 จุดแบบสลับลำดับ: [จุด 4, จุด 2, จุด 5, จุด 1, จุด 3]
    const scrambledInput = [
      fiveCustomers[3],
      fiveCustomers[1],
      fiveCustomers[4],
      fiveCustomers[0],
      fiveCustomers[2],
    ].map((c) => ({
      customerId: c.id,
      customerName: c.name,
      lat: c.lat,
      lng: c.lng,
    }));

    const res = await request(app)
      .post('/api/tms/optimize')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        stops: scrambledInput,
      });

    expect(res.status).toBe(200);
    const orderedIds = res.body.orderedStops.map((s) => s.customerId);
    expect(orderedIds).toEqual(fiveCustomers.map((c) => c.id));

    // คำนวณมือด้วยสูตร Haversine: โรงงาน -> จุด 1 -> จุด 2 -> จุด 3 -> จุด 4 -> จุด 5
    const f = config.factoryLocation;
    const d1 = haversineKm(f.lat, f.lng, fiveCustomers[0].lat, fiveCustomers[0].lng);
    const d2 = haversineKm(fiveCustomers[0].lat, fiveCustomers[0].lng, fiveCustomers[1].lat, fiveCustomers[1].lng);
    const d3 = haversineKm(fiveCustomers[1].lat, fiveCustomers[1].lng, fiveCustomers[2].lat, fiveCustomers[2].lng);
    const d4 = haversineKm(fiveCustomers[2].lat, fiveCustomers[2].lng, fiveCustomers[3].lat, fiveCustomers[3].lng);
    const d5 = haversineKm(fiveCustomers[3].lat, fiveCustomers[3].lng, fiveCustomers[4].lat, fiveCustomers[4].lng);
    const expectedTotalKm = roundKm(d1 + d2 + d3 + d4 + d5);
    const expectedTimeMin = Math.round((expectedTotalKm / 40) * 60 + 5 * 10);

    expect(res.body.totalDistanceKm).toBe(expectedTotalKm);
    expect(res.body.estimatedTimeMin).toBe(expectedTimeMin);
  });

  it('3) POST /api/tms/trips สร้างทริปที่ความจุเกินรถ (รถจุ 50 ถัง, ออเดอร์รวม 60 ถัง) → ตอบ 409 CONFLICT พร้อมตัวเลขใน message', async () => {
    const overCapacityRes = await request(app)
      .post('/api/tms/trips')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        tripDate: TRIP_DATE,
        vehicleId: vehicleSmallId, // maxBottles189L = 50
        driverId: driverEmpId,
        stops: [
          { customerId: fiveCustomers[0].id, seq: 1, planned: { 'FG-189L': 30, 'FG-350ML': 5 } },
          { customerId: fiveCustomers[1].id, seq: 2, planned: { 'FG-189L': 30, 'FG-350ML': 5 } },
        ],
      });

    expect(overCapacityRes.status).toBe(409);
    expect(overCapacityRes.body.error.code).toBe('CONFLICT');
    // ต้องมีตัวเลข 60 และ 50 ในข้อความแจ้งเตือน
    expect(overCapacityRes.body.error.message).toContain('60');
    expect(overCapacityRes.body.error.message).toContain('50');
  });

  it('4) POST /api/tms/trips สร้างทริปเชื่อมกับ route-sheet (45/50 ถัง = 90%) → บันทึก trips + trip_stops ลง DB ครบ + มีคำเตือน 90%', async () => {
    const createRes = await request(app)
      .post('/api/tms/trips')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        tripDate: TRIP_DATE,
        departedTime: '08:30',
        vehicleId: vehicleSmallId,
        driverId: driverEmpId,
        // ไม่ต้องส่ง planned ระบบจะดึงจาก route-sheet ของวันนั้นให้อัตโนมัติ (ป้ายละ 15 ถัง = รวม 45 ถัง)
        stops: [
          { customerId: fiveCustomers[0].id, seq: 1 },
          { customerId: fiveCustomers[1].id, seq: 2 },
          { customerId: fiveCustomers[2].id, seq: 3 },
        ],
      });

    expect(createRes.status).toBe(201);
    const trip = createRes.body;
    expect(trip.code).toMatch(/^TRP-261110-\d{2}$/);
    expect(trip.stopsCount).toBe(3);
    expect(trip.total189L).toBe(45);
    expect(trip.totalPacks).toBe(30);
    expect(trip.totalRevenueSat).toBe(195_000);
    expect(trip.warnings.length).toBeGreaterThanOrEqual(1);
    expect(trip.warnings[0]).toContain('90%');

    // ตรวจตาราง trips และ trip_stops ใน SQLite โดยตรง
    const db = getDb();
    const dbTrip = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(trip.id);
    expect(dbTrip).toBeTruthy();
    expect(dbTrip.total_189l).toBe(45);
    expect(dbTrip.total_packs).toBe(30);

    const dbStops = db
      .prepare(`SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY seq ASC`)
      .all(trip.id);
    expect(dbStops).toHaveLength(3);
    expect(dbStops.map((s) => s.customer_id)).toEqual([
      fiveCustomers[0].id,
      fiveCustomers[1].id,
      fiveCustomers[2].id,
    ]);
  });

  it('5) PUT /api/tms/trips/:id/stops สลับลำดับจุดจอด → คำนวณระยะทางแต่ละช่วง ระยะทางรวม เวลา และค่าน้ำมันใหม่ใน DB', async () => {
    // ดึงทริปล่าสุดที่เพิ่งสร้าง
    const listRes = await request(app)
      .get(`/api/tms/trips?dateFrom=${TRIP_DATE}&dateTo=${TRIP_DATE}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(listRes.status).toBe(200);
    const tripBefore = listRes.body.data[0];
    expect(tripBefore).toBeTruthy();

    // สลับลำดับให้ไปจุดไกลสุดก่อนแล้ววิ่งย้อนกลับมา: [จุด 3 (ไกล), จุด 1 (ใกล้), จุด 2 (กลาง)]
    // ระยะทางจะต้องเพิ่มขึ้นเมื่อเทียบกับเรียง [จุด 1, จุด 2, จุด 3]
    const reorderRes = await request(app)
      .put(`/api/tms/trips/${tripBefore.id}/stops`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        stops: [
          { customerId: fiveCustomers[2].id, seq: 1 },
          { customerId: fiveCustomers[0].id, seq: 2 },
          { customerId: fiveCustomers[1].id, seq: 3 },
        ],
      });

    expect(reorderRes.status).toBe(200);
    const tripAfter = reorderRes.body;

    // คำนวณมือสำหรับลำดับใหม่: โรงงาน -> จุด 3 -> จุด 1 -> จุด 2
    const f = config.factoryLocation;
    const leg1 = roundKm(haversineKm(f.lat, f.lng, fiveCustomers[2].lat, fiveCustomers[2].lng));
    const leg2 = roundKm(haversineKm(fiveCustomers[2].lat, fiveCustomers[2].lng, fiveCustomers[0].lat, fiveCustomers[0].lng));
    const leg3 = roundKm(haversineKm(fiveCustomers[0].lat, fiveCustomers[0].lng, fiveCustomers[1].lat, fiveCustomers[1].lng));
    const rawSum =
      haversineKm(f.lat, f.lng, fiveCustomers[2].lat, fiveCustomers[2].lng) +
      haversineKm(fiveCustomers[2].lat, fiveCustomers[2].lng, fiveCustomers[0].lat, fiveCustomers[0].lng) +
      haversineKm(fiveCustomers[0].lat, fiveCustomers[0].lng, fiveCustomers[1].lat, fiveCustomers[1].lng);
    const expectedNewTotalKm = roundKm(rawSum);
    const expectedNewFuelSat = estimateFuelCostSat(expectedNewTotalKm, 5, 4500);

    expect(tripAfter.totalDistanceKm).toBe(expectedNewTotalKm);
    expect(tripAfter.totalDistanceKm).toBeGreaterThan(tripBefore.totalDistanceKm);
    expect(tripAfter.estimatedFuelCostSat).toBe(expectedNewFuelSat);
    expect(tripAfter.stops.map((s) => s.distanceFromPrevKm)).toEqual([leg1, leg2, leg3]);

    // ตรวจยืนยันใน DB ว่าอัปเดตจริง
    const db = getDb();
    const dbTripAfter = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(tripBefore.id);
    expect(dbTripAfter.total_distance_km).toBe(expectedNewTotalKm);
    expect(dbTripAfter.estimated_fuel_cost_sat).toBe(expectedNewFuelSat);
  });

  it('6) POST /api/tms/trips/:id/complete ปิดทริปสำเร็จ (status = completed)', async () => {
    const listRes = await request(app)
      .get(`/api/tms/trips?dateFrom=${TRIP_DATE}&dateTo=${TRIP_DATE}`)
      .set('Authorization', `Bearer ${driverToken}`);
    const trip = listRes.body.data[0];

    const completeRes = await request(app)
      .post(`/api/tms/trips/${trip.id}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('completed');
  });
});
