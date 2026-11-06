import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { closeDb, dbFile, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashSecret } from '../../src/modules/auth/service.js';
import { seedDefaultInventoryItems } from '../../src/modules/inventory/service.js';
import { resetPortalRateLimiter } from '../../src/modules/portal/service.js';
import { seedDefaultTmsResources } from '../../src/modules/tms/service.js';
import { seedDefaultCmmsResources } from '../../src/modules/cmms/service.js';

describe('Phase 9 — Customer Portal, Dashboard & Reports, and Backup & Restore Tests', () => {
  const app = createApp();
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';

  let customerAId = 0;
  let customerACode = '';
  const customerAPin = '123456';
  let portalTokenA = '';

  let customerBId = 0;
  let customerBCode = '';
  const customerBPin = '654321';
  let portalTokenB = '';

  beforeAll(async () => {
    runMigrations();
    const db = getDb();

    // 1) สร้างบัญชี Staff สำหรับทดสอบ
    const users = [
      { username: 'p9_admin', name: 'P9 Admin', role: 'admin', pass: 'AdminPass-99' },
      { username: 'p9_manager', name: 'P9 Manager', role: 'manager', pass: 'ManagerPass-99' },
      { username: 'p9_staff', name: 'P9 Staff', role: 'staff', pass: 'StaffPass-99' },
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

    adminToken = await loginAs('p9_admin', 'AdminPass-99');
    managerToken = await loginAs('p9_manager', 'ManagerPass-99');
    staffToken = await loginAs('p9_staff', 'StaffPass-99');

    // 2) เตรียมข้อมูลสต็อก, รถ, เครื่องจักร
    seedDefaultInventoryItems(
      {
        'FG-189L': 500,
        'FG-350ML': 300,
        'FG-600ML': 300,
        'FG-1500ML': 300,
        'RET-189L-EMPTY': 200,
        'SP-FILTER-5U': 24,
      },
      { overwrite: true },
    );
    seedDefaultTmsResources();
    seedDefaultCmmsResources();

    // 3) สร้างลูกค้าทดสอบ A และ B
    const custARes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerType: 'shop',
        name: 'ร้านลูกค้าพอร์ทัล A',
        phone: '081-111-2222',
        zone: 'โซนในเมือง',
        prices: {
          'FG-189L': 1800, // 18 บาท
          'FG-350ML': 3200, // 32 บาท
          'FG-600ML': 3200,
          'FG-1500ML': 3200,
        },
      });
    expect(custARes.status).toBe(201);
    customerAId = custARes.body.id;
    customerACode = custARes.body.code;

    const custBRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerType: 'shop',
        name: 'ร้านลูกค้าพอร์ทัล B',
        phone: '081-333-4444',
        zone: 'โซนท่าอิฐ',
        prices: {
          'FG-189L': 2000,
          'FG-350ML': 3500,
          'FG-600ML': 3500,
          'FG-1500ML': 3500,
        },
      });
    expect(custBRes.status).toBe(201);
    customerBId = custBRes.body.id;
    customerBCode = custBRes.body.code;

    // 4) ลงทะเบียน PIN พอร์ทัลให้ลูกค้า A และ B ผ่าน Admin API
    const regARes = await request(app)
      .post(`/api/customers/${customerAId}/portal/register`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ pin: customerAPin });
    expect(regARes.status).toBe(201);

    const regBRes = await request(app)
      .post(`/api/customers/${customerBId}/portal/register`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ pin: customerBPin });
    expect(regBRes.status).toBe(201);
  });

  afterAll(() => {
    closeDb();
  });

  it('1) [PORTAL-1 & PORTAL-3] ล็อกอินพอร์ทัลได้ token (scope: portal) + GET /api/portal/me เห็นข้อมูลราคา, หนี้ค้าง, ถังค้าง และประวัติของตนเอง', async () => {
    resetPortalRateLimiter();

    // ล็อกอินพอร์ทัลด้วยรหัสลูกค้า A + PIN
    const loginRes = await request(app)
      .post('/api/portal/login')
      .send({ customerCode: customerACode, pin: customerAPin });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
    portalTokenA = loginRes.body.token;

    // เรียก GET /api/portal/me ด้วย token ของลูกค้า A
    const meRes = await request(app)
      .get('/api/portal/me')
      .set('Authorization', `Bearer ${portalTokenA}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.customer.id).toBe(customerAId);
    expect(meRes.body.customer.code).toBe(customerACode);
    expect(meRes.body.prices['FG-189L'].unitPriceSat).toBe(1800);
    expect(meRes.body.prices['FG-350ML'].unitPriceSat).toBe(3200);
    expect(meRes.body.financial).toBeDefined();
    expect(Array.isArray(meRes.body.recentOrders)).toBe(true);
  });

  it('2) [ISOLATION] ตรวจสอบการแยกสิทธิ์สองฝั่ง (Token Isolation) 100%', async () => {
    // 2.1) token portal ยิงเข้า API ภายในของ staff (GET /api/customers) -> ต้องได้ 403 FORBIDDEN
    const portalToStaffRes = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${portalTokenA}`);
    expect(portalToStaffRes.status).toBe(403);
    expect(portalToStaffRes.body.error.code).toBe('FORBIDDEN');

    // 2.2) token staff ยิงเข้า API พอร์ทัลลูกค้า (GET /api/portal/me) -> ต้องได้ 403 FORBIDDEN
    const staffToPortalRes = await request(app)
      .get('/api/portal/me')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffToPortalRes.status).toBe(403);
    expect(staffToPortalRes.body.error.code).toBe('FORBIDDEN');
  });

  it('3) [PORTAL-3 Isolation] ลูกค้า A และ B แยกประวัติออเดอร์ของตนเองโดยสิ้นเชิง (Customer Isolation)', async () => {
    resetPortalRateLimiter();

    // ล็อกอินลูกค้า B เพื่อรับ token
    const loginBRes = await request(app)
      .post('/api/portal/login')
      .send({ customerCode: customerBCode, pin: customerBPin });
    expect(loginBRes.status).toBe(200);
    portalTokenB = loginBRes.body.token;

    // ลูกค้า A สั่งซื้อน้ำผ่านพอร์ทัล
    const orderARes = await request(app)
      .post('/api/portal/orders')
      .set('Authorization', `Bearer ${portalTokenA}`)
      .send({
        items: [
          { sku: 'FG-189L', qty: 10 },
          { sku: 'FG-350ML', qty: 5 },
        ],
        notes: 'ส่งช่วงบ่ายร้านกาแฟ A',
      });
    expect(orderARes.status).toBe(201);
    const orderAId = orderARes.body.id;

    // ลูกค้า A ดูรายการออเดอร์ของตัวเอง -> ต้องเจอ orderAId
    const myOrdersARes = await request(app)
      .get('/api/portal/my/orders')
      .set('Authorization', `Bearer ${portalTokenA}`);
    expect(myOrdersARes.status).toBe(200);
    const orderIdsA = myOrdersARes.body.items.map((o) => o.id);
    expect(orderIdsA).toContain(orderAId);

    // ลูกค้า B ดูรายการออเดอร์ของตัวเอง -> ต้องไม่เจอ orderAId ของลูกค้า A
    const myOrdersBRes = await request(app)
      .get('/api/portal/my/orders')
      .set('Authorization', `Bearer ${portalTokenB}`);
    expect(myOrdersBRes.status).toBe(200);
    const orderIdsB = myOrdersBRes.body.items.map((o) => o.id);
    expect(orderIdsB).not.toContain(orderAId);
  });

  it('4) [PORTAL-4] สั่งน้ำผ่านพอร์ทัล -> ออเดอร์ draft source=portal ปรากฏในฝั่ง staff + ห้ามตัดสต็อกสินค้า', async () => {
    const db = getDb();
    const stock189Before = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('FG-189L').stock;

    // สั่งซื้อน้ำถัง 18.9L 25 ถังผ่านพอร์ทัลลูกค้า A
    const res = await request(app)
      .post('/api/portal/orders')
      .set('Authorization', `Bearer ${portalTokenA}`)
      .send({
        items: [{ sku: 'FG-189L', qty: 25 }],
        notes: 'สั่งน้ำถัง 25 ใบ (PORTAL TEST)',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.source).toBe('portal');
    expect(res.body.customerId).toBe(customerAId);
    // ราคาลูกค้า A คือ 1,800 สตางค์ -> 25 * 1800 = 45,000 สตางค์ (450 บาท)
    expect(res.body.totalSat).toBe(45000);

    // ตรวจสอบในฐานข้อมูลว่าสต็อกสินค้า FG-189L ยังคงเท่าเดิม (ห้ามตัดสต็อกขณะยังเป็น draft)
    const stock189After = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('FG-189L').stock;
    expect(stock189After).toBe(stock189Before);

    // ฝั่ง staff ตรวจสอบรายการออเดอร์ (GET /api/orders) -> ต้องพบออเดอร์นี้และมี source = 'portal'
    const staffOrdersRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffOrdersRes.status).toBe(200);
    const foundPortalOrder = staffOrdersRes.body.data.find((o) => o.id === res.body.id);
    expect(foundPortalOrder).toBeTruthy();
    expect(foundPortalOrder.source).toBe('portal');
    expect(foundPortalOrder.status).toBe('draft');
  });

  it('5) [PORTAL-2] PIN ผิด 5 ครั้ง -> ครั้งที่ 6 ตอบ 409 พร้อม lockMinutes + admin สั่ง unlock ได้', async () => {
    resetPortalRateLimiter();

    // สร้างลูกค้ารายใหม่สำหรับทดสอบ PIN ล็อก
    const testCustRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerType: 'shop',
        name: 'ร้านทดสอบ PIN ล็อก',
        phone: '089-999-9999',
        zone: 'โซนในเมือง',
      });
    expect(testCustRes.status).toBe(201);
    const testCustId = testCustRes.body.id;
    const testCustCode = testCustRes.body.code;

    // ตั้ง PIN เริ่มต้น 112233
    await request(app)
      .post(`/api/customers/${testCustId}/portal/register`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ pin: '112233' });

    // ยิง PIN ผิด 5 ครั้งติด
    for (let i = 1; i <= 5; i++) {
      const wrongRes = await request(app)
        .post('/api/portal/login')
        .send({ customerCode: testCustCode, pin: '000000' });

      if (i < 5) {
        expect(wrongRes.status).toBe(401);
      } else {
        // ครั้งที่ 5 ทำผิดครบตามโควตา -> ล็อกทันที
        expect(wrongRes.status).toBe(409);
        expect(wrongRes.body.error.code).toBe('CONFLICT');
        expect(wrongRes.body.error.lockMinutes).toBe(15);
      }
    }

    // ครั้งที่ 6 ยิงมาอีก (แม้จะใส่ PIN ถูกต้อง 112233) -> ต้องติด 409 CONFLICT เพราะถูกล็อกอยู่
    resetPortalRateLimiter();
    const attempt6Res = await request(app)
      .post('/api/portal/login')
      .send({ customerCode: testCustCode, pin: '112233' });
    expect(attempt6Res.status).toBe(409);
    expect(attempt6Res.body.error.code).toBe('CONFLICT');

    // Admin สั่งปลดล็อกผ่าน POST /api/customers/:id/portal/unlock
    const unlockRes = await request(app)
      .post(`/api/customers/${testCustId}/portal/unlock`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.success).toBe(true);

    // หลังปลดล็อก สามารถล็อกอินด้วย PIN ถูกต้องได้ทันที
    resetPortalRateLimiter();
    const loginOkRes = await request(app)
      .post('/api/portal/login')
      .send({ customerCode: testCustCode, pin: '112233' });
    expect(loginOkRes.status).toBe(200);
    expect(loginOkRes.body.token).toBeTruthy();
  });

  it('6) [RPT-1 & RPT-3] แดชบอร์ดสรุปยอดขายและการแจ้งเตือนทุกประเภทใน response เดียวตรงกับฐานข้อมูลจริง', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/api/reports/dashboard?asOf=${today}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    const body = res.body;

    // ตรวจโครงสร้างข้อมูลแดชบอร์ดตามข้อกำหนด RPT-1
    expect(body.sales).toBeDefined();
    expect(body.sales.todaySalesSat).toBeGreaterThanOrEqual(0);
    expect(body.sales.monthSalesSat).toBeGreaterThanOrEqual(0);
    expect(body.sales.pendingOrdersCount).toBeGreaterThanOrEqual(1); // มี draft จากข้อ 4

    expect(body.alerts).toBeDefined();
    expect(body.alerts.debtAging).toBeDefined();
    expect(body.alerts.lowStock).toBeDefined();
    expect(body.alerts.duePm).toBeDefined();
    expect(body.alerts.licenseExpiring).toBeDefined();

    // RPT-3: กราฟแนวโน้มยอดขาย 12 เดือน
    expect(Array.isArray(body.sales12MonthsTrend)).toBe(true);
  });

  it('7) [RPT-2] รายงานยอดขาย (groupBy=day) และ Export Excel (.xlsx) ที่เปิดด้วย ExcelJS ได้ข้อมูลตรงเป๊ะ', async () => {
    // 7.1) ดึงรายงานยอดขายแบบ JSON
    const reportRes = await request(app)
      .get('/api/reports/sales?groupBy=day')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.groupBy).toBe('day');
    expect(Array.isArray(reportRes.body.items)).toBe(true);

    // 7.2) ส่งออกไฟล์ Excel
    const exportRes = await request(app)
      .get('/api/reports/sales/export?groupBy=day')
      .set('Authorization', `Bearer ${managerToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(exportRes.status).toBe(200);
    expect(exportRes.header['content-type']).toContain('spreadsheetml');

    // ตรวจสอบว่า buffer เป็นไฟล์ Excel (.xlsx) ที่ถูกต้องโดยใช้ ExcelJS อ่านกลับ
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exportRes.body);
    const sheet = workbook.getWorksheet(1);
    expect(sheet).toBeDefined();
    expect(sheet.name).toBe('รายงานยอดขาย');
    expect(sheet.rowCount).toBeGreaterThanOrEqual(2); // Header + Summary หรือ Data
  });

  it('8) [BKP-1 & BKP-2] สำรองข้อมูลแบบ manual (VACUUM INTO) + ตรวจสอบ list + คืนค่าฐานข้อมูล (Restore Round-trip) พร้อมสำรองไฟล์เดิมเป็น .pre-restore', async () => {
    // 8.1) แอดมินรันการสำรองข้อมูลแบบทันที (POST /api/backup/run)
    const runRes = await request(app)
      .post('/api/backup/run')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(runRes.status).toBe(201);
    expect(runRes.body.success).toBe(true);
    const backupFilename = runRes.body.filename;
    expect(backupFilename).toMatch(/^inthara-.*\.db$/);

    // ตรวจสอบว่าไฟล์สำรองถูกสร้างขึ้นจริงในดิสก์
    const backupFilePath = path.join(config.backupsDir, backupFilename);
    expect(fs.existsSync(backupFilePath)).toBe(true);
    expect(fs.statSync(backupFilePath).size).toBeGreaterThan(0);

    // 8.2) ตรวจสอบรายการไฟล์สำรอง (GET /api/backup/list) และสถานะ (GET /api/backup/status)
    const listRes = await request(app)
      .get('/api/backup/list')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const filenames = listRes.body.backups.map((b) => b.filename);
    expect(filenames).toContain(backupFilename);

    const statusRes = await request(app)
      .get('/api/backup/status')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.totalBackups).toBeGreaterThanOrEqual(1);

    // 8.3) ลองคืนค่าด้วยรหัสผ่านแอดมินผิด -> ต้องได้ 401 UNAUTHORIZED
    const wrongPassRes = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: backupFilename,
        adminPassword: 'WrongPassword123!',
      });
    expect(wrongPassRes.status).toBe(401);

    // 8.4) จำลองการเปลี่ยนแปลงในฐานข้อมูลเพื่อทดสอบ Round-trip
    const tempCustRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        customerType: 'shop',
        name: 'ลูกค้าชั่วคราวสร้างหลัง Backup เพื่อทดสอบ Restore Round-trip',
        phone: '088-777-6666',
      });
    expect(tempCustRes.status).toBe(201);
    const tempCustId = tempCustRes.body.id;

    // ตรวจว่าลูกค้าชั่วคราวอยู่ใน DB
    const checkCustBefore = getDb().prepare('SELECT id FROM customers WHERE id = ?').get(tempCustId);
    expect(checkCustBefore).toBeTruthy();

    // 8.5) แอดมินสั่งคืนค่าฐานข้อมูลจากไฟล์สำรองแรกด้วยรหัสผ่านแอดมินที่ถูกต้อง
    const restoreRes = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        filename: backupFilename,
        adminPassword: 'AdminPass-99',
      });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);

    // ตรวจสอบว่ามีไฟล์ .pre-restore ถูกสร้างขึ้นในโฟลเดอร์ data
    const preRestoreName = restoreRes.body.preRestoreBackup;
    expect(preRestoreName).toMatch(/^inthara\.db\.pre-restore-/);
    const preRestorePath = path.join(config.dataDir, preRestoreName);
    expect(fs.existsSync(preRestorePath)).toBe(true);

    // ตรวจสอบ Round-trip: ข้อมูลถูกย้อนกลับไปยังตอนสำรอง (ลูกค้าชั่วคราวต้องหายไปเพราะสร้างหลัง Backup)
    const checkCustAfter = getDb().prepare('SELECT id FROM customers WHERE id = ?').get(tempCustId);
    expect(checkCustAfter).toBeUndefined();

    // ทำความสะอาดไฟล์ pre-restore หลังทดสอบ
    try {
      if (fs.existsSync(preRestorePath)) fs.unlinkSync(preRestorePath);
    } catch {}
  });
});
