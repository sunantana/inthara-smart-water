import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashSecret } from '../../src/modules/auth/service.js';
import {
  calculatePackagingFifoPlan,
  seedDefaultInventoryItems,
} from '../../src/modules/inventory/service.js';
import {
  buildProductionLotPrefix,
  generateNextProductionLotNo,
} from '../../src/modules/production/service.js';
import { seedDefaultTmsResources } from '../../src/modules/tms/service.js';

describe('Phase 7 — Production + Water QA + Packaging FIFO Unit & Integration Tests', () => {
  const app = createApp();
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let driverToken = '';
  let sampleAssetId = 0;

  beforeAll(async () => {
    runMigrations();
    const db = getDb();

    const users = [
      { username: 'p7_admin', name: 'P7 Admin', role: 'admin', pass: 'AdminPass-99' },
      { username: 'p7_manager', name: 'P7 Manager', role: 'manager', pass: 'ManagerPass-99' },
      { username: 'p7_staff', name: 'P7 Staff QC', role: 'staff', pass: 'StaffPass-99' },
      { username: 'p7_driver', name: 'P7 Driver', role: 'driver', pass: 'DriverPass-99' },
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

    adminToken = await loginAs('p7_admin', 'AdminPass-99');
    managerToken = await loginAs('p7_manager', 'ManagerPass-99');
    staffToken = await loginAs('p7_staff', 'StaffPass-99');
    driverToken = await loginAs('p7_driver', 'DriverPass-99');

    seedDefaultInventoryItems(
      {
        'FG-189L': 500,
        'FG-350ML': 300,
        'FG-600ML': 300,
        'FG-1500ML': 300,
        'RET-189L-EMPTY': 200,
      },
      { overwrite: true },
    );

    const seededTms = seedDefaultTmsResources();
    sampleAssetId = seededTms.vehicles[0].assetId;
  });

  afterAll(() => {
    closeDb();
  });

  describe('Unit Tests — Lot Number Generator & Packaging FIFO Calculation', () => {
    it('generateNextProductionLotNo สร้างรหัส LOT-YYMMDD-กะ-ลำดับ เรียงถูกต้อง และแยกกะ D/N ไม่ชนกัน', () => {
      expect(buildProductionLotPrefix('2026-11-12', 'day')).toBe('LOT-261112-D-');
      expect(buildProductionLotPrefix('2026-11-12', 'night')).toBe('LOT-261112-N-');

      const firstDay = generateNextProductionLotNo('2026-11-12', 'day', []);
      expect(firstDay).toBe('LOT-261112-D-1');

      const secondDay = generateNextProductionLotNo('2026-11-12', 'day', ['LOT-261112-D-1']);
      expect(secondDay).toBe('LOT-261112-D-2');

      const firstNight = generateNextProductionLotNo('2026-11-12', 'night', [
        'LOT-261112-D-1',
        'LOT-261112-D-2',
      ]);
      expect(firstNight).toBe('LOT-261112-N-1');
    });

    it('calculatePackagingFifoPlan ตัด 3 ล็อตปนกันเรียงตามวันที่ซื้อเก่า→ใหม่ ล็อตที่หมดกลางทางได้ status=depleted และโยน 400 เมื่อไม่พอ', () => {
      // ส่ง 3 ล็อตเข้ามาแบบสลับวันที่ซื้อ เพื่อพิสูจน์ว่าเรียง purchase_date ASC เสมอ
      const mixedLots = [
        { id: 2, lotNo: 'LOT-MID', purchaseDate: '2026-10-10', remainingQty: 50, unitCostSat: 120, status: 'active' },
        { id: 3, lotNo: 'LOT-NEW', purchaseDate: '2026-10-20', remainingQty: 80, unitCostSat: 130, status: 'active' },
        { id: 1, lotNo: 'LOT-OLD', purchaseDate: '2026-10-01', remainingQty: 40, unitCostSat: 100, status: 'active' },
      ];

      // ต้องการใช้ 110 ชิ้น -> ต้องตัด LOT-OLD (40, depleted) + LOT-MID (50, depleted) + LOT-NEW (20, เหลือ 60 active)
      const plan = calculatePackagingFifoPlan('PKG-CAP', mixedLots, 110);
      expect(plan.deductions).toHaveLength(3);
      expect(plan.deductions.map((d) => ({
        lotNo: d.lotNo,
        takeQty: d.takeQty,
        afterQty: d.afterQty,
        nextStatus: d.nextStatus,
      }))).toEqual([
        { lotNo: 'LOT-OLD', takeQty: 40, afterQty: 0, nextStatus: 'depleted' },
        { lotNo: 'LOT-MID', takeQty: 50, afterQty: 0, nextStatus: 'depleted' },
        { lotNo: 'LOT-NEW', takeQty: 20, afterQty: 60, nextStatus: 'active' },
      ]);
      expect(plan.remainingTotalAfter).toBe(60);

      // กรณีต้องการ 200 ชิ้น แต่มีรวมแค่ 170 ชิ้น -> ต้องโยน 400 พร้อมบอก SKU และคงเหลือ
      expect(() => calculatePackagingFifoPlan('PKG-CAP', mixedLots, 200)).toThrowError(
        /PKG-CAP.*200.*170/,
      );
    });
  });

  describe('Integration Tests — Production Lots, QA Stock & FIFO Packaging Deduction', () => {
    const PROD_DATE = '2026-11-15';
    let lotDay1Id = 0;
    let lotDay2Id = 0;
    let lotNight1Id = 0;

    it('1) สร้างล็อตผลิต 2 ครั้งในวันเดียวกัน ได้ lotNo เรียง LOT-YYMMDD-D-1, LOT-YYMMDD-D-2 และกะกลางคืน LOT-YYMMDD-N-1 ไม่ชนกัน', async () => {
      const res1 = await request(app)
        .post('/api/production/lots')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productionDate: PROD_DATE,
          shift: 'day',
          plan: { 'FG-189L': 150, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 },
          actual: { 'FG-189L': 150, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 },
          tdsRaw: 235,
          tdsRo: 8.2,
          ph: 7.2,
          notes: 'ล็อตที่ 1 กะกลางวัน (ผลิตจริง 150 ถัง)',
        });
      expect(res1.status).toBe(201);
      expect(res1.body.lotNo).toBe('LOT-261115-D-1');
      expect(res1.body.qaPassed).toBeNull();
      lotDay1Id = res1.body.id;

      const res2 = await request(app)
        .post('/api/production/lots')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          productionDate: PROD_DATE,
          shift: 'day',
          plan: { 'FG-189L': 100, 'FG-350ML': 20, 'FG-600ML': 0, 'FG-1500ML': 0 },
          actual: { 'FG-189L': 80, 'FG-350ML': 20, 'FG-600ML': 0, 'FG-1500ML': 0 },
          tdsRaw: 250,
          tdsRo: 65.0,
          ph: 6.1,
          notes: 'ล็อตที่ 2 กะกลางวัน (ทดสอบไม่ผ่าน QA)',
        });
      expect(res2.status).toBe(201);
      expect(res2.body.lotNo).toBe('LOT-261115-D-2');
      lotDay2Id = res2.body.id;

      const resNight = await request(app)
        .post('/api/production/lots')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          productionDate: PROD_DATE,
          shift: 'night',
          plan: { 'FG-189L': 100 },
          actual: { 'FG-189L': 100 },
          tdsRaw: 230,
          tdsRo: 7.9,
          ph: 7.3,
        });
      expect(resNight.status).toBe(201);
      expect(resNight.body.lotNo).toBe('LOT-261115-N-1');
      lotNight1Id = resNight.body.id;
    });

    it('2) รับเข้าล็อตบรรจุภัณฑ์ 2 ล็อต (100 + 100) ผูก linkedAssetId แล้วตรวจ QA ผ่าน (ใช้ 150) → ล็อตเก่าหมด (depleted), ล็อตใหม่เหลือ 50, FG-189L +150, มี movements ครบ', async () => {
      const db = getDb();
      // เคลียร์ล็อตของ PKG-BOTTLE-189L เดิมก่อนเพื่อจำลอง 2 ล็อต (100 + 100) ตามโจทย์ตรวจรับอย่างแม่นยำ
      db.prepare(`DELETE FROM packaging_lots WHERE sku = 'PKG-BOTTLE-189L'`).run();
      db.prepare(`UPDATE inventory_items SET stock = 0 WHERE sku = 'PKG-BOTTLE-189L'`).run();

      // รับเข้า Lot เก่า (วันที่ 2026-11-01 จำนวน 100 ถัง) ผูกกับ sampleAssetId (INV-3)
      const pkgLot1Res = await request(app)
        .post('/api/inventory/packaging-lots')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          lotNo: 'PKG-TEST-OLD-100',
          purchaseDate: '2026-11-01',
          sku: 'PKG-BOTTLE-189L',
          quantity: 100,
          unitCostSat: 12000,
          supplier: 'ซัพพลายเออร์ A',
          linkedAssetId: sampleAssetId,
        });
      expect(pkgLot1Res.status).toBe(201);
      expect(pkgLot1Res.body.linkedAssetId).toBe(sampleAssetId);

      // รับเข้า Lot ใหม่ (วันที่ 2026-11-05 จำนวน 100 ถัง)
      const pkgLot2Res = await request(app)
        .post('/api/inventory/packaging-lots')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          lotNo: 'PKG-TEST-NEW-100',
          purchaseDate: '2026-11-05',
          sku: 'PKG-BOTTLE-189L',
          quantity: 100,
          unitCostSat: 12500,
          supplier: 'ซัพพลายเออร์ B',
        });
      expect(pkgLot2Res.status).toBe(201);

      // ตรวจสต็อก PKG-BOTTLE-189L ก่อนตัด = 200 และ FG-189L ก่อนตรวจ QA = 500
      const fgBefore = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'FG-189L'`).get().stock;
      const pkgBefore = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'PKG-BOTTLE-189L'`).get().stock;
      expect(fgBefore).toBe(500);
      expect(pkgBefore).toBe(200);

      // ตรวจ QA ผ่านสำหรับ lotDay1Id (ผลิตจริง FG-189L = 150 ถัง -> ต้องใช้ PKG-BOTTLE-189L = 150 ใบ)
      const qaPassRes = await request(app)
        .post(`/api/production/lots/${lotDay1Id}/qa`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          passed: true,
        });

      expect(qaPassRes.status).toBe(200);
      expect(qaPassRes.body.qaPassed).toBe(true);

      // ตรวจ DB โดยตรง:
      // 1) FG-189L เพิ่มจาก 500 -> 650 (+150)
      const fgAfter = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'FG-189L'`).get().stock;
      expect(fgAfter).toBe(650);

      // 2) ล็อตบรรจุภัณฑ์เก่า (PKG-TEST-OLD-100) เหลือ 0 และ status = 'depleted'
      //    ล็อตบรรจุภัณฑ์ใหม่ (PKG-TEST-NEW-100) เหลือ 50 และ status = 'active'
      const lotOldDb = db.prepare(`SELECT remaining_qty, status FROM packaging_lots WHERE lot_no = 'PKG-TEST-OLD-100'`).get();
      const lotNewDb = db.prepare(`SELECT remaining_qty, status FROM packaging_lots WHERE lot_no = 'PKG-TEST-NEW-100'`).get();
      expect(lotOldDb).toEqual({ remaining_qty: 0, status: 'depleted' });
      expect(lotNewDb).toEqual({ remaining_qty: 50, status: 'active' });

      // 3) สต็อก PKG-BOTTLE-189L ใน inventory_items เท่ากับ SUM(remaining_qty) = 50 พอดี
      const pkgAfter = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'PKG-BOTTLE-189L'`).get().stock;
      expect(pkgAfter).toBe(50);

      // 4) มี stock_movements reason = 'production_in' (+150) และ 'packaging_consume' (-100, -50)
      const prodInMov = db
        .prepare(
          `SELECT sku, qty_change, reason, lot_no FROM stock_movements
           WHERE ref_type = 'production_lot' AND ref_id = ? AND reason = 'production_in'`,
        )
        .all(String(lotDay1Id));
      expect(prodInMov).toEqual([
        { sku: 'FG-189L', qty_change: 150, reason: 'production_in', lot_no: 'LOT-261115-D-1' },
      ]);

      const pkgConsumeMovs = db
        .prepare(
          `SELECT sku, qty_change, reason, lot_no FROM stock_movements
           WHERE ref_type = 'production_lot' AND ref_id = ? AND reason = 'packaging_consume' AND sku = 'PKG-BOTTLE-189L'
           ORDER BY id ASC`,
        )
        .all(String(lotDay1Id));
      expect(pkgConsumeMovs).toEqual([
        { sku: 'PKG-BOTTLE-189L', qty_change: -100, reason: 'packaging_consume', lot_no: 'PKG-TEST-OLD-100' },
        { sku: 'PKG-BOTTLE-189L', qty_change: -50, reason: 'packaging_consume', lot_no: 'PKG-TEST-NEW-100' },
      ]);
    });

    it('3) ล็อตที่ตรวจ QA ไปแล้ว ห้ามตรวจ QA ซ้ำ → ตอบ 409 CONFLICT', async () => {
      const dupQaRes = await request(app)
        .post(`/api/production/lots/${lotDay1Id}/qa`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ passed: true });

      expect(dupQaRes.status).toBe(409);
      expect(dupQaRes.body.error.code).toBe('CONFLICT');
    });

    it('4) QA ไม่ผ่าน (passed: false) → qa_passed = 0, สต็อก FG ไม่เพิ่ม, ไม่มี movement เกิดขึ้น (PRD-2)', async () => {
      const db = getDb();
      const fgBefore = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'FG-189L'`).get().stock;
      const movCountBefore = db.prepare(`SELECT COUNT(*) AS cnt FROM stock_movements`).get().cnt;

      const qaFailRes = await request(app)
        .post(`/api/production/lots/${lotDay2Id}/qa`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          passed: false,
          notes: 'ค่า TDS RO สูงเกินเกณฑ์ ระงับการโอนเข้า FG',
        });

      expect(qaFailRes.status).toBe(200);
      expect(qaFailRes.body.qaPassed).toBe(false);

      const lotRow = db.prepare(`SELECT qa_passed FROM production_lots WHERE id = ?`).get(lotDay2Id);
      expect(lotRow.qa_passed).toBe(0);

      const fgAfter = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'FG-189L'`).get().stock;
      const movCountAfter = db.prepare(`SELECT COUNT(*) AS cnt FROM stock_movements`).get().cnt;
      expect(fgAfter).toBe(fgBefore);
      expect(movCountAfter).toBe(movCountBefore);
    });

    it('5) บรรจุภัณฑ์ไม่พอตอนกดผ่าน QA (ต้องการ 100 แต่ PKG-BOTTLE-189L เหลือ 50) → ตอบ 400 บอก SKU + คงเหลือ และ Rollback ทั้งหมด (สต็อกไม่ขยับเลย)', async () => {
      const db = getDb();
      const fgBefore = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'FG-189L'`).get().stock;
      const pkgBefore = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'PKG-BOTTLE-189L'`).get().stock;
      expect(pkgBefore).toBe(50);

      // lotNight1Id ผลิตจริง FG-189L = 100 ถัง แต่ PKG-BOTTLE-189L เหลือเพียง 50 ใบ
      const insufficientRes = await request(app)
        .post(`/api/production/lots/${lotNight1Id}/qa`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          passed: true,
        });

      expect(insufficientRes.status).toBe(400);
      expect(insufficientRes.body.error.message).toContain('PKG-BOTTLE-189L');
      expect(insufficientRes.body.error.message).toContain('50');

      // ตรวจยืนยัน Transaction Rollback:
      // - ล็อต lotNight1Id ต้องยังเป็น qa_passed = NULL (ยังไม่ถูกเปลี่ยนเป็น 1)
      // - สต็อก FG-189L และ PKG-BOTTLE-189L ต้องไม่ขยับเลย
      const lotAfter = db.prepare(`SELECT qa_passed FROM production_lots WHERE id = ?`).get(lotNight1Id);
      const fgAfter = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'FG-189L'`).get().stock;
      const pkgAfter = db.prepare(`SELECT stock FROM inventory_items WHERE sku = 'PKG-BOTTLE-189L'`).get().stock;

      expect(lotAfter.qa_passed).toBeNull();
      expect(fgAfter).toBe(fgBefore);
      expect(pkgAfter).toBe(pkgBefore);
    });

    it('6) GET /api/production/lots, GET /api/production/dashboard และ GET /api/inventory/packaging-lots คืนข้อมูลสรุปถูกต้อง', async () => {
      const listRes = await request(app)
        .get(`/api/production/lots?dateFrom=${PROD_DATE}&dateTo=${PROD_DATE}&shift=day`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.lots).toHaveLength(2);

      const dashRes = await request(app)
        .get(`/api/production/dashboard?dateFrom=${PROD_DATE}&dateTo=${PROD_DATE}`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(dashRes.status).toBe(200);
      expect(dashRes.body.summary.totalLots).toBe(3);
      expect(dashRes.body.summary.qaPassedCount).toBe(1);
      expect(dashRes.body.summary.qaFailedCount).toBe(1);
      expect(dashRes.body.summary.qaPendingCount).toBe(1);

      const pkgListRes = await request(app)
        .get('/api/inventory/packaging-lots?sku=PKG-BOTTLE-189L')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(pkgListRes.status).toBe(200);
      expect(pkgListRes.body.lots).toHaveLength(2);
    });
  });
});
