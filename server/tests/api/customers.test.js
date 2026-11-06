import http from 'node:http';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { resetLoginRateLimiter } from '../../src/modules/auth/router.js';
import { hashSecret, resetAuthMemoryState } from '../../src/modules/auth/service.js';
import { explainCustomerQueryPlan } from '../../src/modules/customers/repo.js';

const app = createApp();

const TEST_USERS = {
  admin: {
    username: 'admin',
    password: 'AdminPassword123!',
    pin: '111111',
    displayName: 'แอดมินทดสอบ',
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
};

function resetDatabaseAndSeedUsers() {
  const db = getDb();
  db.exec(`
    DELETE FROM customer_price_history;
    DELETE FROM customer_prices;
    DELETE FROM order_items;
    DELETE FROM orders;
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
  resetDatabaseAndSeedUsers();
});

describe('Phase 2 — CRM (Customers) + Pricing Integration Tests', () => {
  describe('1) โมดูล Price Tiers (/api/price-tiers)', () => {
    it('สร้าง แก้ไข แสดงรายการ และป้องกันการลบ Price Tier ที่มีลูกค้าผูกอยู่ (409)', async () => {
      const managerToken = await loginAs('manager');
      const adminToken = await loginAs('admin');
      const staffToken = await loginAs('staff');

      // staff ห้ามสร้าง Price Tier
      const staffCreate = await request(app)
        .post('/api/price-tiers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'ราคาปลีกทั่วไป',
          price189lSat: 2000,
          price350mlSat: 3500,
          price600mlSat: 4000,
          price1500mlSat: 4000,
        });
      expect(staffCreate.status).toBe(403);

      // manager สร้าง Price Tier ได้
      const createRes = await request(app)
        .post('/api/price-tiers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'ราคาส่งร้านค้า',
          price189lSat: 1500,
          price350mlSat: 3200,
          price600mlSat: 3500,
          price1500mlSat: 3500,
        });
      expect(createRes.status).toBe(201);
      const tierId = createRes.body.data.id;
      expect(createRes.body.data).toMatchObject({
        name: 'ราคาส่งร้านค้า',
        price189lSat: 1500,
        price350mlSat: 3200,
        price600mlSat: 3500,
        price1500mlSat: 3500,
      });

      // ผูกลูกค้าเข้ากับ tier นี้
      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านค้าทดสอบผูก Tier',
          priceTierId: tierId,
        });
      expect(custRes.status).toBe(201);

      // ลบ tier ที่มีลูกค้าผูกอยู่ → ต้องได้ 409 CONFLICT
      const deleteInUse = await request(app)
        .delete(`/api/price-tiers/${tierId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteInUse.status).toBe(409);
      expect(deleteInUse.body.error.code).toBe('CONFLICT');

      // สร้าง tier ที่ไม่มีลูกค้าผูก แล้วลบด้วย admin → 200 OK
      const unusedTier = await request(app)
        .post('/api/price-tiers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'ราคาชั่วคราว',
          price189lSat: 1800,
          price350mlSat: 3400,
          price600mlSat: 3600,
          price1500mlSat: 3600,
        });
      const delOk = await request(app)
        .delete(`/api/price-tiers/${unusedTier.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delOk.status).toBe(200);
    });
  });

  describe('2) การสร้างลูกค้า + ออกรหัส CUS-0001 อัตโนมัติ + สิทธิ์ RBAC', () => {
    it('staff เรียก POST /api/customers → 403, manager → 201 พร้อมออก code CUS-0001 เรียงอัตโนมัติและบันทึกครบทุก field', async () => {
      const staffToken = await loginAs('staff');
      const managerToken = await loginAs('manager');

      const forbiddenRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านที่ staff พยายามสร้าง',
        });
      expect(forbiddenRes.status).toBe(403);

      const firstRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'organization',
          name: 'โรงเรียนท่าปลาอนุสรณ์ 1',
          contactPerson: 'ครูพัสดุ',
          phone: '055-499-104',
          taxId: '0994000158211',
          branchType: 'สำนักงานใหญ่',
          houseNo: '129',
          moo: '1',
          subdistrict: 'ท่าปลา',
          district: 'ท่าปลา',
          province: 'อุตรดิตถ์',
          postalCode: '53150',
          lat: 17.7865,
          lng: 100.431,
          outstandingBottles: 25,
          balanceSat: 50000,
          creditTermDays: 30,
          prices: {
            'FG-189L': 1200,
            'FG-350ML': 3000,
            'FG-600ML': 3200,
            'FG-1500ML': 3200,
          },
        });

      expect(firstRes.status).toBe(201);
      expect(firstRes.body.data).toMatchObject({
        code: 'CUS-0001',
        customerType: 'organization',
        name: 'โรงเรียนท่าปลาอนุสรณ์ 1',
        contactPerson: 'ครูพัสดุ',
        phone: '055-499-104',
        taxId: '0994000158211',
        branchType: 'สำนักงานใหญ่',
        zone: 'โซนท่าปลา - ต.ท่าปลา',
        houseNo: '129',
        moo: 'หมู่ 1',
        subdistrict: 'ท่าปลา',
        district: 'ท่าปลา',
        province: 'อุตรดิตถ์',
        postalCode: '53150',
        address: 'บ้านเลขที่ 129 หมู่ 1 ต.ท่าปลา อ.ท่าปลา จ.อุตรดิตถ์ 53150',
        lat: 17.7865,
        lng: 100.431,
        outstandingBottles: 25,
        balanceSat: 50000,
        creditTermDays: 30,
        isActive: true,
        prices: {
          'FG-189L': 1200,
          'FG-350ML': 3000,
          'FG-600ML': 3200,
          'FG-1500ML': 3200,
        },
      });

      const secondRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านโชห่วยแม่สมศรี',
          subdistrict: 'จริม',
        });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.code).toBe('CUS-0002');
    });
  });

  describe('3) Pagination (60 รายการ) + กรอง search/zone/type + ตรวจ EXPLAIN QUERY PLAN', () => {
    it('สร้าง 60 ลูกค้า → หน้า 1 ได้ 50 รายการ + total=60 + totalPages=2 และกรอง search/zone/type โดยใช้ index (ไม่มี SCAN ตาราง customers)', async () => {
      const managerToken = await loginAs('manager');

      for (let i = 1; i <= 60; i += 1) {
        const isGov = i % 3 === 0;
        const zone = i <= 35 ? 'โซนท่าปลา - ต.จริม' : 'โซนท่าปลา - ต.หาดล้า';
        const res = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${managerToken}`)
          .send({
            customerType: isGov ? 'organization' : 'shop',
            name: `ลูกค้าทดสอบลำดับที่ ${String(i).padStart(3, '0')}`,
            zone,
            phone: `081-000-${String(i).padStart(4, '0')}`,
          });
        expect(res.status).toBe(201);
      }

      const page1 = await request(app)
        .get('/api/customers?page=1&limit=50')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(50);
      expect(page1.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 60,
        totalPages: 2,
      });

      const page2 = await request(app)
        .get('/api/customers?page=2&limit=50')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(page2.status).toBe(200);
      expect(page2.body.data).toHaveLength(10);

      // กรองตาม zone + type
      const filteredRes = await request(app)
        .get('/api/customers')
        .query({
          zone: 'โซนท่าปลา - ต.จริม',
          type: 'organization',
        })
        .set('Authorization', `Bearer ${managerToken}`);
      expect(filteredRes.status).toBe(200);
      expect(filteredRes.body.data.length).toBeGreaterThan(0);
      for (const c of filteredRes.body.data) {
        expect(c.zone).toBe('โซนท่าปลา - ต.จริม');
        expect(c.customerType).toBe('organization');
      }

      // กรองตาม search ชื่อ
      const searchRes = await request(app)
        .get('/api/customers')
        .query({ search: 'ลูกค้าทดสอบลำดับที่ 055' })
        .set('Authorization', `Bearer ${managerToken}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data).toHaveLength(1);
      expect(searchRes.body.data[0].code).toBe('CUS-0055');

      // ตรวจสอบ EXPLAIN QUERY PLAN ว่าใช้ SEARCH ... USING INDEX ไม่ใช่ SCAN ตาราง customers
      const planZone = explainCustomerQueryPlan({
        zone: 'โซนท่าปลา - ต.จริม',
        type: 'organization',
        isActive: true,
      });
      const planSearch = explainCustomerQueryPlan({
        search: 'ลูกค้าทดสอบ',
        isActive: true,
      });

      const detailsZone = planZone.map((p) => p.detail).join(' | ');
      const detailsSearch = planSearch.map((p) => p.detail).join(' | ');

      expect(detailsZone).toContain('SEARCH c USING INDEX');
      expect(detailsZone).not.toMatch(/\bSCAN c\b/);
      expect(detailsSearch).toContain('SEARCH c USING INDEX');
      expect(detailsSearch).not.toMatch(/\bSCAN c\b/);
    });
  });

  describe('4) แก้ไขราคาเฉพาะราย (PUT /api/customers/:id/prices) + ประวัติเปลี่ยนราคา (PRC-3)', () => {
    it('บันทึกการเปลี่ยนราคาลง customer_prices + เก็บประวัติใน customer_price_history และคืนค่าใน GET /:id', async () => {
      const managerToken = await loginAs('manager');

      const createRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านริมน่านมินิมาร์ท',
          prices: {
            'FG-189L': 1500,
            'FG-350ML': 3500,
            'FG-600ML': 3500,
            'FG-1500ML': 3500,
          },
        });
      const customerId = createRes.body.data.id;

      const updatePriceRes = await request(app)
        .put(`/api/customers/${customerId}/prices`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          prices: {
            'FG-189L': 1300,
            'FG-600ML': 3300,
          },
        });
      expect(updatePriceRes.status).toBe(200);

      const detailRes = await request(app)
        .get(`/api/customers/${customerId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.prices).toEqual({
        'FG-189L': 1300,
        'FG-350ML': 3500,
        'FG-600ML': 3300,
        'FG-1500ML': 3500,
      });

      const changed189 = detailRes.body.priceHistory.find(
        (h) => h.sku === 'FG-189L' && h.oldPriceSat === 1500 && h.newPriceSat === 1300,
      );
      expect(changed189).toBeTruthy();
      expect(changed189.changedByUsername).toBe('manager');
    });
  });

  describe('5) Soft Delete (DELETE /api/customers/:id) + Export XLSX + Resolve Google Maps URL', () => {
    it('DELETE แล้วลูกค้าหายจาก list ปกติ (active=1) แต่ยังอยู่ใน DB และติด 409 ถ้ามีออเดอร์ค้าง', async () => {
      const managerToken = await loginAs('manager');
      const adminToken = await loginAs('admin');

      const c1 = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ customerType: 'person', name: 'นายสมชาย ใจดี' });
      const customerId = c1.body.data.id;

      // ลบด้วย admin → soft delete สำเร็จ
      const delRes = await request(app)
        .delete(`/api/customers/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.data.isActive).toBe(false);

      // เรียก GET /api/customers ปกติ (active=1) จะไม่พบ
      const activeList = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(activeList.body.data.find((x) => x.id === customerId)).toBeUndefined();

      // แต่ยังอยู่ใน DB จริง และดึงด้วยGET /:id หรือ ?active=0 ได้
      const inactiveList = await request(app)
        .get('/api/customers?active=0')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(inactiveList.body.data.find((x) => x.id === customerId)).toBeTruthy();

      // ถ้ามีออเดอร์สถานะ draft/confirmed ผูกอยู่ → ลบไม่ได้ (409)
      const c2 = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ customerType: 'shop', name: 'ร้านมีออเดอร์ค้าง' });
      const c2Id = c2.body.data.id;

      const db = getDb();
      db.prepare(
        `INSERT INTO orders (code, customer_id, status, delivery_date, total_sat)
         VALUES ('ORD-261106-001', ?, 'confirmed', '2026-11-06', 15000)`,
      ).run(c2Id);

      const conflictDel = await request(app)
        .delete(`/api/customers/${c2Id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(conflictDel.status).toBe(409);
      expect(conflictDel.body.error.code).toBe('CONFLICT');
    });

    it('GET /api/customers/export ส่งออกไฟล์ .xlsx ที่เปิดด้วย ExcelJS ได้และมีข้อมูลตรงตาม filter', async () => {
      const managerToken = await loginAs('manager');

      await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'organization',
          name: 'โรงพยาบาลท่าปลา',
          zone: 'โซนท่าปลา - ต.ท่าปลา',
          phone: '055-499-020',
          prices: { 'FG-189L': 1200, 'FG-350ML': 3000, 'FG-600ML': 3200, 'FG-1500ML': 3200 },
        });

      await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerType: 'shop',
          name: 'ร้านค้าบ้านน้ำหมัน',
          zone: 'โซนท่าปลา - ต.น้ำหมัน',
          phone: '082-334-6655',
        });

      const exportRes = await request(app)
        .get('/api/customers/export')
        .query({ zone: 'โซนท่าปลา - ต.ท่าปลา' })
        .set('Authorization', `Bearer ${managerToken}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(exportRes.status).toBe(200);
      expect(exportRes.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(exportRes.headers['content-disposition']).toContain('attachment; filename=');

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(exportRes.body);
      const sheet = wb.getWorksheet('Customers');
      expect(sheet).toBeTruthy();
      expect(sheet.rowCount).toBe(2); // 1 header + 1 filtered row
      expect(sheet.getRow(2).getCell(1).value).toBe('CUS-0001');
      expect(sheet.getRow(2).getCell(3).value).toBe('โรงพยาบาลท่าปลา');
      expect(sheet.getRow(2).getCell(9).value).toBe(12); // 1200 satang = 12 บาท
    });

    it('POST /api/customers/resolve-gmaps-url แปลงลิงก์ Google Maps เป็น {lat, lng} ได้จริง', async () => {
      const staffToken = await loginAs('staff');

      const res = await request(app)
        .post('/api/customers/resolve-gmaps-url')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          url: 'https://www.google.com/maps/place/%E0%B9%80%E0%B8%82%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%99%E0%B8%AA%E0%B8%B4%E0%B8%A3%E0%B8%B4%E0%B8%81%E0%B8%B4%E0%B8%95%E0%B8%B4%E0%B9%8C/@17.7647,100.5629,15z/data=!3d17.764722!4d100.562911',
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        lat: 17.764722,
        lng: 100.562911,
      });
    });
  });
});
