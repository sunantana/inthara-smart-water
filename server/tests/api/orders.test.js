import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { resetLoginRateLimiter } from '../../src/modules/auth/router.js';
import { hashSecret, resetAuthMemoryState } from '../../src/modules/auth/service.js';
import { explainOrderQueryPlan } from '../../src/modules/orders/repo.js';
import {
  buildOrderFingerprint,
  buildOrderItemsAndTotal,
  derivePaymentStatus,
  formatOrderCode,
  resetOrderDuplicateWindow,
} from '../../src/modules/orders/service.js';

const app = createApp();

const TEST_USERS = {
  admin: {
    username: 'admin',
    password: 'AdminPassword123!',
    pin: '111111',
    displayName: 'ผู้ดูแลระบบทดสอบ',
    role: 'admin',
  },
  manager: {
    username: 'manager',
    password: 'ManagerPassword123!',
    pin: '222222',
    displayName: 'ผู้จัดการทดสอบ',
    role: 'manager',
  },
  staff: {
    username: 'staff',
    password: 'StaffPassword123!',
    pin: '333333',
    displayName: 'พนักงานสำนักงานทดสอบ',
    role: 'staff',
  },
  driver: {
    username: 'driver',
    password: 'DriverPassword123!',
    pin: '444444',
    displayName: 'พนักงานขับรถทดสอบ',
    role: 'driver',
  },
};

function resetDatabaseAndSeedUsers() {
  const db = getDb();
  db.exec(`
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customer_price_history;
    DELETE FROM customer_prices;
    DELETE FROM customer_ledger;
    DELETE FROM customers;
    DELETE FROM price_tiers;
    DELETE FROM audit_logs;
    DELETE FROM users;
  `);

  const stmt = db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, pin, is_active)
    VALUES (@username, @displayName, @role, @passwordHash, @pinHash, 1)
  `);

  for (const u of Object.values(TEST_USERS)) {
    stmt.run({
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      passwordHash: hashSecret(u.password),
      pinHash: hashSecret(u.pin),
    });
  }
}

async function loginAs(roleKey) {
  const acc = TEST_USERS[roleKey];
  const res = await request(app).post('/api/auth/login').send({
    username: acc.username,
    password: acc.password,
  });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  resetLoginRateLimiter();
  resetAuthMemoryState();
  resetOrderDuplicateWindow();
  resetDatabaseAndSeedUsers();
});

describe('Phase 3 — Orders Unit & Integration Tests', () => {
  describe('Unit Tests — Orders Service', () => {
    it('formatOrderCode สร้างรหัส ORD-YYMMDD-NNN เรียงลำดับถูกต้อง', () => {
      expect(formatOrderCode('2026-11-06', 1)).toBe('ORD-261106-001');
      expect(formatOrderCode('2026-11-06', 15)).toBe('ORD-261106-015');
    });

    it('buildOrderItemsAndTotal คำนวณยอดรวมจากราคาทะเบียนลูกค้าเสมอ และปฏิเสธเมื่อรวม qty = 0', () => {
      const customerPrices = {
        'FG-189L': 15000,
        'FG-350ML': 3500,
        'FG-600ML': 3500,
        'FG-1500ML': 3500,
      };

      const calc = buildOrderItemsAndTotal(
        [
          { sku: 'FG-189L', qty: 10, unitPriceSat: 1 }, // ส่งราคาปลอมมาต้องถูกเพิกเฉย
          { sku: 'FG-600ML', qty: 2, unitPriceSat: 1 },
        ],
        customerPrices,
      );

      expect(calc.totalSat).toBe(150000 + 7000);
      expect(calc.items).toEqual([
        { sku: 'FG-189L', qty: 10, unitPriceSat: 15000, lineTotalSat: 150000 },
        { sku: 'FG-600ML', qty: 2, unitPriceSat: 3500, lineTotalSat: 7000 },
      ]);

      expect(() =>
        buildOrderItemsAndTotal([{ sku: 'FG-189L', qty: 0 }], customerPrices),
      ).toThrow(/จำนวนสินค้าทั้งหมดรวมกันต้องมากกว่า 0/);
    });

    it('derivePaymentStatus และ buildOrderFingerprint ทำงานถูกต้อง', () => {
      expect(derivePaymentStatus(10000, 0)).toBe('unpaid');
      expect(derivePaymentStatus(10000, 4000)).toBe('partial');
      expect(derivePaymentStatus(10000, 10000)).toBe('paid');

      const fp = buildOrderFingerprint(7, '2026-11-06', {
        'FG-189L': 10,
        'FG-350ML': 0,
        'FG-600ML': 5,
        'FG-1500ML': 0,
      });
      expect(fp).toBe('7|2026-11-06|FG-189L:10|FG-350ML:0|FG-600ML:5|FG-1500ML:0');
    });
  });

  describe('1) การสร้างออเดอร์ + ออกรหัส ORD-YYMMDD-NNN + คำนวณยอดจากราคาลูกค้า (ORD-1, ORD-2, PRC-2)', () => {
    it('สร้างออเดอร์ 2 รายการ ออกรหัส ORD-261106-001 และ ORD-261106-002 เรียงถูกต้อง', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');

      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'organization',
          name: 'โรงเรียนท่าปลาอนุสรณ์ 1',
          zone: 'โซนท่าปลา - ต.ท่าปลา',
          prices: {
            'FG-189L': 15000,
            'FG-350ML': 3500,
            'FG-600ML': 3500,
            'FG-1500ML': 3500,
          },
        });
      const customerId = custRes.body.data.id;

      // ออเดอร์ที่ 1: สั่ง FG-189L จำนวน 10 ถัง (ราคา 15,000 satang/ถัง) → totalSat = 150,000 satang
      const ord1 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-06',
          items: [{ sku: 'FG-189L', qty: 10 }],
          notes: 'ส่งอาคารเรียน 1',
        });

      expect(ord1.status).toBe(201);
      expect(ord1.body.data).toMatchObject({
        code: 'ORD-261106-001',
        customerId,
        status: 'draft',
        deliveryDate: '2026-11-06',
        totalSat: 150000,
        paidSat: 0,
        paymentStatus: 'unpaid',
      });

      // ออเดอร์ที่ 2: วันเดียวกัน จำนวนต่างกัน → ได้ ORD-261106-002
      const ord2 = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-06',
          items: [{ sku: 'FG-189L', qty: 5 }],
        });

      expect(ord2.status).toBe(201);
      expect(ord2.body.data.code).toBe('ORD-261106-002');
      expect(ord2.body.data.totalSat).toBe(75000);
    });

    it('ส่งราคาโกงใน body (unitPriceSat: 1) → ถูก ignore และคำนวณจากราคาลูกค้าเสมอ', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');

      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านค้าทดสอบกันโกงราคา',
          prices: {
            'FG-189L': 15000,
            'FG-350ML': 3500,
            'FG-600ML': 3500,
            'FG-1500ML': 3500,
          },
        });
      const customerId = custRes.body.data.id;

      const ordRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-06',
          totalSat: 10,
          items: [
            {
              sku: 'FG-189L',
              qty: 10,
              unitPriceSat: 1,
              unit_price_sat: 1,
              price: 1,
            },
          ],
        });

      expect(ordRes.status).toBe(201);
      expect(ordRes.body.data.totalSat).toBe(150000);
      expect(ordRes.body.data.items[0].unitPriceSat).toBe(15000);
    });

    it('items รวม qty = 0 → ตอบ 400 VALIDATION_ERROR (ORD-1)', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');

      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ customerType: 'shop', name: 'ร้านทดสอบจำนวนศูนย์' });
      const customerId = custRes.body.data.id;

      const zeroRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-06',
          items: [
            { sku: 'FG-189L', qty: 0 },
            { sku: 'FG-600ML', qty: 0 },
          ],
        });

      expect(zeroRes.status).toBe(400);
      expect(zeroRes.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2) กันกดส่งซ้ำภายใน 4 วินาที (ORD-3)', () => {
    it('POST เดิมซ้ำ 2 ครั้งติดกัน → ครั้งที่ 2 ได้ duplicateIgnored: true และนับใน DB ได้ 1 แถว', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');

      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ customerType: 'shop', name: 'ร้านทดสอบกดซ้ำ' });
      const customerId = custRes.body.data.id;

      const payload = {
        customerId,
        deliveryDate: '2026-11-06',
        items: [
          { sku: 'FG-189L', qty: 12 },
          { sku: 'FG-600ML', qty: 5 },
        ],
      };

      const first = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(payload);
      expect(first.status).toBe(201);
      expect(first.body.duplicateIgnored).toBe(false);

      const second = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send(payload);
      expect(second.status).toBe(200);
      expect(second.body.duplicateIgnored).toBe(true);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(second.body.data.code).toBe(first.body.data.code);

      const db = getDb();
      const count = db.prepare('SELECT COUNT(*) AS total FROM orders').get().total;
      expect(count).toBe(1);
    });
  });

  describe('3) การแก้ไข สถานะ Confirm/Cancel และห้ามแก้ออเดอร์ที่ delivered (ORD-2)', () => {
    it('PUT ออเดอร์ draft แก้ได้, confirm เปลี่ยนสถานะเป็น confirmed, และ PUT ออเดอร์ delivered ได้ 409 CONFLICT', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');

      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านทดสอบสถานะออเดอร์',
          prices: {
            'FG-189L': 1500,
            'FG-350ML': 3500,
            'FG-600ML': 3500,
            'FG-1500ML': 3500,
          },
        });
      const customerId = custRes.body.data.id;

      const createRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-06',
          items: [{ sku: 'FG-189L', qty: 10 }],
        });
      const orderId = createRes.body.data.id;

      // แก้ไขตอน draft → 200 OK
      const updateDraft = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          items: [{ sku: 'FG-189L', qty: 20 }],
          notes: 'เพิ่มจำนวนเป็น 20 ถัง',
        });
      expect(updateDraft.status).toBe(200);
      expect(updateDraft.body.data.totalSat).toBe(30000);

      // กดยืนยัน (confirm) → status = confirmed
      const confirmRes = await request(app)
        .post(`/api/orders/${orderId}/confirm`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.status).toBe('confirmed');

      // จำลองสถานะ delivered ใน DB แล้วลอง PUT แก้ไข → ต้องได้ 409 CONFLICT
      const db = getDb();
      db.prepare(`UPDATE orders SET status = 'delivered' WHERE id = ?`).run(orderId);

      const editDelivered = await request(app)
        .put(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          notes: 'พยายามแก้หลังส่งเสร็จ',
        });
      expect(editDelivered.status).toBe(409);
      expect(editDelivered.body.error.code).toBe('CONFLICT');
    });
  });

  describe('4) Route-sheet อัตโนมัติ (ORD-6) + กรอง + EXPLAIN QUERY PLAN + Export XLSX + RBAC', () => {
    it('สร้างออเดอร์ 2 ลูกค้าวันเดียวกัน → GET /api/orders/route-sheet คืน 2 ป้ายจอดพร้อมจำนวนถูกต้อง', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');

      const c1 = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'organization',
          name: 'อบต.จริม',
          zone: 'โซนท่าปลา - ต.จริม',
          lat: 17.798,
          lng: 100.391,
        });

      const c2 = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านโชห่วยบ้านหาดล้า',
          zone: 'โซนท่าปลา - ต.จริม',
          lat: 17.734,
          lng: 100.352,
        });

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId: c1.body.data.id,
          deliveryDate: '2026-11-07',
          items: [
            { sku: 'FG-189L', qty: 25 },
            { sku: 'FG-600ML', qty: 10 },
          ],
        });

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId: c2.body.data.id,
          deliveryDate: '2026-11-07',
          items: [
            { sku: 'FG-189L', qty: 15 },
            { sku: 'FG-1500ML', qty: 5 },
          ],
        });

      const sheetRes = await request(app)
        .get('/api/orders/route-sheet')
        .query({ date: '2026-11-07', zone: 'โซนท่าปลา - ต.จริม' })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(sheetRes.status).toBe(200);
      expect(sheetRes.body.totalStops).toBe(2);
      expect(sheetRes.body.stops).toHaveLength(2);
      expect(sheetRes.body.quantities).toEqual({
        'FG-189L': 40,
        'FG-350ML': 0,
        'FG-600ML': 10,
        'FG-1500ML': 5,
      });
    });

    it('กรองออเดอร์ครบทุกตัวแปร + EXPLAIN QUERY PLAN ใช้ index (ไม่มี SCAN ตาราง orders) + Export XLSX + สิทธิ์ driver 403', async () => {
      const managerToken = await loginAs('manager');
      const staffToken = await loginAs('staff');
      const driverToken = await loginAs('driver');

      const cust = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านทดสอบฟิลเตอร์ออเดอร์',
          zone: 'โซนท่าปลาเหนือ',
        });
      const customerId = cust.body.data.id;

      // driver ห้ามสร้างออเดอร์ → 403 FORBIDDEN
      const driverCreate = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-08',
          items: [{ sku: 'FG-189L', qty: 5 }],
        });
      expect(driverCreate.status).toBe(403);

      // staff สร้างออเดอร์ได้
      const staffCreate = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          deliveryDate: '2026-11-08',
          items: [{ sku: 'FG-189L', qty: 8 }],
        });
      expect(staffCreate.status).toBe(201);

      // กรองตาม customerId, zone, status, paymentStatus, dateFrom, dateTo
      const listRes = await request(app)
        .get('/api/orders')
        .query({
          customerId,
          zone: 'โซนท่าปลาเหนือ',
          status: 'draft',
          paymentStatus: 'unpaid',
          dateFrom: '2026-11-01',
          dateTo: '2026-11-30',
        })
        .set('Authorization', `Bearer ${staffToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].code).toBe('ORD-261108-001');

      // ตรวจ EXPLAIN QUERY PLAN ว่าใช้ index บนตาราง orders (ไม่มี SCAN o)
      const planStatusDate = explainOrderQueryPlan({
        status: 'draft',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-30',
      });
      const planCustomer = explainOrderQueryPlan({
        customerId,
      });

      const detailsStatusDate = planStatusDate.map((p) => p.detail).join(' | ');
      const detailsCustomer = planCustomer.map((p) => p.detail).join(' | ');

      expect(detailsStatusDate).toContain('SEARCH o USING INDEX');
      expect(detailsStatusDate).not.toMatch(/\bSCAN o\b/);
      expect(detailsCustomer).toContain('SEARCH o USING INDEX');
      expect(detailsCustomer).not.toMatch(/\bSCAN o\b/);

      // Export XLSX
      const exportRes = await request(app)
        .get('/api/orders/export')
        .query({ dateFrom: '2026-11-01', dateTo: '2026-11-30' })
        .set('Authorization', `Bearer ${managerToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(exportRes.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(exportRes.body);
      const sheet = wb.getWorksheet('Orders');
      expect(sheet).toBeTruthy();
      expect(sheet.rowCount).toBe(2);
      expect(sheet.getRow(2).getCell(1).value).toBe('ORD-261108-001');
    });
  });
});
