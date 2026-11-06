import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { seedProduction } from '../../scripts/seed-production.mjs';

describe('Phase 10 — End-to-End (E2E) Smoke & Production Verification', () => {
  const app = createApp();
  let db;

  const ADMIN_PASS = 'AdminPassE2E-2026!';
  let seededAccounts = [];

  let ownerToken = '';
  let adminToken = '';
  let qcToken = '';
  let techToken = '';
  let driverToken = '';

  let priceTierId = 0;
  let customerId = 0;
  let customerCode = '';
  const customerPin = '556677';

  let orderId = 0;
  let orderCode = '';
  let portalToken = '';

  let vehicleId = 0;
  let driverId = 0;
  let tripId = 0;

  let initialStock189 = 0;
  let initialStock600 = 0;
  let initialStockEmpty = 0;

  beforeAll(() => {
    runMigrations();
    db = getDb();

    // รันการ Seed ข้อมูลระดับ Production ด้วย seedProduction
    seededAccounts = seedProduction({ adminPassword: ADMIN_PASS });
  });

  afterAll(() => {
    closeDb();
  });

  it('1) [SEED & LOGIN] ล็อกอินทั้ง 5 บัญชีหลักของ Production ได้สำเร็จและมีบทบาทถูกต้อง', async () => {
    expect(seededAccounts.length).toBe(5);

    // 1.1) owner_inthara (admin)
    const ownerAcc = seededAccounts.find((a) => a.username === 'owner_inthara');
    expect(ownerAcc).toBeDefined();
    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner_inthara', password: ADMIN_PASS });
    expect(ownerLogin.status).toBe(200);
    expect(ownerLogin.body.user.role).toBe('admin');
    ownerToken = ownerLogin.body.accessToken;

    // 1.2) admin_office (admin)
    const adminAcc = seededAccounts.find((a) => a.username === 'admin_office');
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin_office', password: adminAcc.password });
    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.user.role).toBe('admin');
    adminToken = adminLogin.body.accessToken;

    // 1.3) qc_production (staff)
    const qcAcc = seededAccounts.find((a) => a.username === 'qc_production');
    const qcLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'qc_production', password: qcAcc.password });
    expect(qcLogin.status).toBe(200);
    expect(qcLogin.body.user.role).toBe('staff');
    qcToken = qcLogin.body.accessToken;

    // 1.4) tech_cmms (staff)
    const techAcc = seededAccounts.find((a) => a.username === 'tech_cmms');
    const techLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'tech_cmms', password: techAcc.password });
    expect(techLogin.status).toBe(200);
    expect(techLogin.body.user.role).toBe('staff');
    techToken = techLogin.body.accessToken;

    // 1.5) driver_gps (driver)
    const driverAcc = seededAccounts.find((a) => a.username === 'driver_gps');
    const driverLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'driver_gps', password: driverAcc.password });
    expect(driverLogin.status).toBe(200);
    expect(driverLogin.body.user.role).toBe('driver');
    driverToken = driverLogin.body.accessToken;
  });

  it('2) [GZIP & PRODUCTION SERVING] ตรวจสอบ gzip compression บน /api/* และ SPA Fallback', async () => {
    // 2.1) Gzip header บน /api/health เมื่อส่ง Accept-Encoding: gzip
    const gzipRes = await request(app)
      .get('/api/health')
      .set('Accept-Encoding', 'gzip, deflate');
    expect(gzipRes.status).toBe(200);
    expect(gzipRes.headers['content-encoding']).toBe('gzip');

    // 2.2) Production serving & SPA fallback
    const webDist = path.resolve(config.dataDir, '../../web/dist');
    const indexHtml = path.join(webDist, 'index.html');
    let createdMockDist = false;

    if (!fs.existsSync(indexHtml)) {
      fs.mkdirSync(webDist, { recursive: true });
      fs.writeFileSync(indexHtml, '<!DOCTYPE html><html><body><div id="root">Smart Water ERP</div></body></html>');
      createdMockDist = true;
    }

    try {
      // จำลองโหมด production
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const prodApp = createApp();

      // GET / -> ต้องตอบ index.html
      const rootRes = await request(prodApp).get('/');
      expect(rootRes.status).toBe(200);
      expect(rootRes.headers['content-type']).toContain('text/html');
      expect(rootRes.text).toContain('Smart Water');

      // GET /customers (SPA route ที่ไม่ใช่ /api/*) -> ต้องตอบ index.html
      const spaRes = await request(prodApp).get('/customers');
      expect(spaRes.status).toBe(200);
      expect(spaRes.headers['content-type']).toContain('text/html');
      expect(spaRes.text).toContain('Smart Water');

      // GET /api/health -> ต้องตอบ JSON (ไม่ตกเข้า index.html)
      const healthRes = await request(prodApp).get('/api/health');
      expect(healthRes.status).toBe(200);
      expect(healthRes.headers['content-type']).toContain('application/json');
      expect(healthRes.body.status).toBe('ok');

      // GET /api/nonexistent -> ต้องตอบ 404 JSON NOT_FOUND (ไม่ตกเข้า index.html)
      const notFoundApi = await request(prodApp).get('/api/some-undefined-path');
      expect(notFoundApi.status).toBe(404);
      expect(notFoundApi.body.error.code).toBe('NOT_FOUND');

      process.env.NODE_ENV = origEnv;
    } finally {
      if (createdMockDist && fs.existsSync(indexHtml)) {
        fs.unlinkSync(indexHtml);
      }
    }
  });

  it('3) [CRM & PRICING] สร้าง Price Tier และลูกค้าพร้อมพิกัด GPS + ลงทะเบียน PIN พอร์ทัล', async () => {
    // 3.1) สร้าง Price Tier ใหม่ (ใช้ camelCase ตาม createPriceTierSchema)
    const ptRes = await request(app)
      .post('/api/price-tiers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tier E2E VIP ท่าปลา',
        price189lSat: 1400, // 14.00 บาท
        price350mlSat: 2800, // 28.00 บาท
        price600mlSat: 3200, // 32.00 บาท
        price1500mlSat: 3800, // 38.00 บาท
      });
    expect(ptRes.status).toBe(201);
    priceTierId = ptRes.body.data ? ptRes.body.data.id : ptRes.body.id;

    // 3.2) สร้างลูกค้าใหม่พร้อมพิกัด
    const custRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerType: 'organization',
        name: 'โรงพยาบาลท่าปลา สาขา 2 (E2E)',
        phone: '055-441-234',
        address: '102 หมู่ 3 ต.ท่าปลา อ.ท่าปลา จ.อุตรดิตถ์',
        zone: 'โซนท่าปลา - ต.ท่าปลา',
        lat: 17.7942,
        lng: 100.5281,
        priceTierId,
      });
    expect(custRes.status).toBe(201);
    customerId = custRes.body.id;
    customerCode = custRes.body.code;
    expect(customerCode).toMatch(/^CUS-\d{4}$/);

    // 3.3) ลงทะเบียน PIN พอร์ทัลให้ลูกค้า
    const regRes = await request(app)
      .post(`/api/customers/${customerId}/portal/register`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: customerPin });
    expect(regRes.status).toBe(201);
  });

  it('4) [PORTAL & ORDER] ลูกค้าสั่งน้ำผ่านพอร์ทัล -> ออเดอร์ draft -> เจ้าหน้าที่กดยืนยัน', async () => {
    // 4.1) ลูกค้าล็อกอินพอร์ทัล
    const pLogin = await request(app)
      .post('/api/portal/login')
      .send({ customerCode, pin: customerPin });
    expect(pLogin.status).toBe(200);
    expect(pLogin.body.token).toBeDefined();
    portalToken = pLogin.body.token;

    // บันทึกสต็อกก่อนสั่ง
    initialStock189 = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock;
    initialStock600 = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-600ML').stock;
    initialStockEmpty = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('RET-189L-EMPTY').stock;

    // 4.2) ลูกค้าสั่งน้ำ: ถัง 18.9L = 30 ใบ, แพ็ค 600ML = 10 แพ็ค
    // ราคาตาม Tier: (30 * 1400) + (10 * 3200) = 42,000 + 32,000 = 74,000 สตางค์ (740.00 บาท)
    const today = new Date().toISOString().slice(0, 10);
    const pOrder = await request(app)
      .post('/api/portal/orders')
      .set('Authorization', `Bearer ${portalToken}`)
      .send({
        deliveryDate: today,
        items: [
          { sku: 'FG-189L', qty: 30 },
          { sku: 'FG-600ML', qty: 10 },
        ],
        notes: 'กรุณาส่งช่วงเช้าหน้าตึกอำนวยการ',
      });

    expect(pOrder.status).toBe(201);
    orderId = pOrder.body.id;
    orderCode = pOrder.body.code;
    expect(pOrder.body.status).toBe('draft');
    expect(pOrder.body.source).toBe('portal');
    expect(pOrder.body.totalSat).toBe(74000);

    // ตรวจสอบว่ายังไม่มีการตัดสต็อกขณะเป็น draft
    const stockCheck = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock;
    expect(stockCheck).toBe(initialStock189);

    // 4.3) เจ้าหน้าที่สำนักงานยืนยันออเดอร์
    const confirmRes = await request(app)
      .put(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'confirmed' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('confirmed');
  });

  it('5) [TMS] สร้างเที่ยววิ่ง (Trip) บรรจุออเดอร์ในเส้นทาง', async () => {
    // ดึงพาหนะและคนขับ
    const veh = db.prepare('SELECT id FROM vehicles LIMIT 1').get();
    const drv = db.prepare('SELECT id FROM employees LIMIT 1').get();
    expect(veh).toBeDefined();
    expect(drv).toBeDefined();
    vehicleId = veh.id;
    driverId = drv.id;

    const today = new Date().toISOString().slice(0, 10);
    const tripRes = await request(app)
      .post('/api/tms/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tripDate: today,
        departedTime: '08:30',
        vehicleId,
        driverId,
        stops: [
          { customerId, seq: 1 },
        ],
      });

    expect(tripRes.status).toBe(201);
    tripId = tripRes.body.id;
    expect(tripRes.body.status).toBe('planned');
    expect(tripRes.body.stopsCount).toBe(1);
  });

  it('6) [DELIVERY CHECK-IN] คนขับ Check-in หน้างาน: ตัดสต็อกจริง, รับถังเปล่าคืน, บันทึกหนี้', async () => {
    // คนขับส่งของสำเร็จ: ส่งครบ 30 ถัง + 10 แพ็ค, รับถังเปล่าคืน 25 ใบ, รับเงินสด 30,000 สตางค์ (300 บ.), ค้าง 44,000 สตางค์ (440 บ.)
    const checkinRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        tripId,
        delivered: { 'FG-189L': 30, 'FG-600ML': 10 },
        returned189L: 25,
        paymentMode: 'cash',
        moneyReceivedSat: 30000,
        notes: 'ส่งเรียบร้อย รับเงินสด 300 บาท',
      });

    expect(checkinRes.status).toBe(201);

    // 6.1) ตรวจสอบสถานะออเดอร์ในฐานข้อมูล -> delivered
    const ordAfter = db.prepare('SELECT status, paid_sat FROM orders WHERE id = ?').get(orderId);
    expect(ordAfter.status).toBe('delivered');
    expect(ordAfter.paid_sat).toBe(30000);

    // 6.2) ตรวจสอบการตัดสต็อกสินค้าใน inventory_items
    const stock189After = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock;
    const stock600After = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-600ML').stock;
    const stockEmptyAfter = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('RET-189L-EMPTY').stock;

    expect(stock189After).toBe(initialStock189 - 30);
    expect(stock600After).toBe(initialStock600 - 10);
    expect(stockEmptyAfter).toBe(initialStockEmpty + 25);

    // 6.3) ตรวจสอบยอดหนี้ค้างชำระของลูกค้า = 74,000 - 30,000 = 44,000 สตางค์
    const unpaidDebt = db.prepare(`
      SELECT COALESCE(SUM(total_sat - paid_sat), 0) AS debt
      FROM orders
      WHERE customer_id = ? AND status = 'delivered'
    `).get(customerId).debt;
    expect(unpaidDebt).toBe(44000);
  });

  it('7) [BILLING FIFO & DEPOSIT] ปิดยอดค้างชำระแบบ FIFO + รับเงินมัดจำถังน้ำเข้าบัญชีลูกค้า', async () => {
    // 7.1) ชำระหนี้ส่วนที่เหลือ 44,000 สตางค์ผ่านระบบ Billing FIFO
    const settleRes = await request(app)
      .post('/api/billing/settle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        amountSat: 44000,
        method: 'transfer',
        note: 'โอนชำระส่วนที่เหลือครบถ้วน',
      });

    expect(settleRes.status).toBe(200);

    // ออเดอร์ต้องจ่ายครบ 74,000 สตางค์
    const ordSettled = db.prepare('SELECT paid_sat FROM orders WHERE id = ?').get(orderId);
    expect(ordSettled.paid_sat).toBe(74000);

    // 7.2) ลูกค้าฝากเงินมัดจำถังน้ำ (Deposit IN) 15,000 สตางค์ (150 บาท)
    const depRes = await request(app)
      .post(`/api/customers/${customerId}/deposit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'in',
        amountSat: 15000,
        note: 'มัดจำถังเปล่าสำรอง 5 ใบ',
      });

    expect(depRes.status).toBe(200);
    expect(depRes.body.balanceSat).toBe(15000);

    const custBal = db.prepare('SELECT balance_sat FROM customers WHERE id = ?').get(customerId);
    expect(custBal.balance_sat).toBe(15000);
  });

  it('8) [TRIP COMPLETE] คนขับปิดทริปการจัดส่ง', async () => {
    const completeRes = await request(app)
      .post(`/api/tms/trips/${tripId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('completed');

    const tripRow = db.prepare('SELECT status FROM trips WHERE id = ?').get(tripId);
    expect(tripRow.status).toBe('completed');
  });

  it('9) [DASHBOARD VERIFICATION] ยอดขายบนแดชบอร์ดต้องนับเฉพาะออเดอร์ delivered เท่านั้น (ไม่รวม draft)', async () => {
    // 9.1) สร้างออเดอร์ draft รายการที่สองจาก Portal (ยอด 14,000 สตางค์)
    const today = new Date().toISOString().slice(0, 10);
    const draft2 = await request(app)
      .post('/api/portal/orders')
      .set('Authorization', `Bearer ${portalToken}`)
      .send({
        deliveryDate: today,
        items: [{ sku: 'FG-189L', qty: 10 }], // 10 * 1400 = 14,000 สตางค์
        notes: 'ออเดอร์ Draft ทดสอบแดชบอร์ด',
      });
    expect(draft2.status).toBe(201);
    expect(draft2.body.status).toBe('draft');

    // 9.2) เรียกดูแดชบอร์ด
    const dashRes = await request(app)
      .get(`/api/reports/dashboard?asOf=${today}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dashRes.status).toBe(200);
    const dash = dashRes.body;

    // ยอดขายวันนี้ต้องนับเฉพาะออเดอร์ delivered (74,000 สตางค์) โดยไม่นับ draft 14,000 สตางค์
    expect(dash.sales.todaySalesSat).toBe(74000);
    expect(dash.sales.todaySalesBaht).toBe(740);
    expect(dash.sales.todayOrdersCount).toBe(1);

    // ต้องแสดงจำนวนออเดอร์ draft จาก portal แยกไว้
    expect(dash.sales.portalDraftOrdersCount).toBeGreaterThanOrEqual(1);
    expect(dash.sales.pendingOrdersCount).toBeGreaterThanOrEqual(1);
  });

  it('10) [PRODUCTION LOT & QA] ผลิตน้ำดื่มกะใหม่ + QA ผ่าน -> รับ FG-189L เข้าสต็อกจริง', async () => {
    // ใส่ล็อตบรรจุภัณฑ์ให้เพียงพอต่อการบรรจุ 50 ถัง
    db.prepare(`
      INSERT INTO packaging_lots (lot_no, sku, purchase_date, quantity, remaining_qty, unit_cost_sat, status)
      VALUES ('PKG-E2E-LOT-1', 'PKG-BOTTLE-189L', '2026-11-01', 500, 500, 12000, 'active')
      ON CONFLICT(lot_no) DO UPDATE SET remaining_qty = 500, status = 'active'
    `).run();
    db.prepare(`
      UPDATE inventory_items SET stock = stock + 500 WHERE sku = 'PKG-BOTTLE-189L'
    `).run();

    const stock189BeforeLot = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock;
    const today = new Date().toISOString().slice(0, 10);

    // 10.1) สร้าง Lot ผลิตใหม่
    const lotRes = await request(app)
      .post('/api/production/lots')
      .set('Authorization', `Bearer ${qcToken}`)
      .send({
        productionDate: today,
        shift: 'day',
        plan: { 'FG-189L': 50, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 },
        actual: { 'FG-189L': 50, 'FG-350ML': 0, 'FG-600ML': 0, 'FG-1500ML': 0 },
        tdsRaw: 235,
        tdsRo: 8.2,
        ph: 7.2,
        notes: 'ผลิตล็อต E2E 50 ถัง',
      });
    expect(lotRes.status).toBe(201);
    const lotId = lotRes.body.id;

    // 10.2) บันทึกผลการตรวจ QA ผ่าน
    const qaRes = await request(app)
      .post(`/api/production/lots/${lotId}/qa`)
      .set('Authorization', `Bearer ${qcToken}`)
      .send({
        passed: true,
        notes: 'คุณภาพน้ำผ่านเกณฑ์มาตรฐานโรงงาน',
      });
    expect(qaRes.status).toBe(200);
    expect(qaRes.body.qaPassed).toBe(true);

    // 10.3) สต็อก FG-189L ในฐานข้อมูลเพิ่มขึ้น 50 ถัง
    const stock189AfterLot = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock;
    expect(stock189AfterLot).toBe(stock189BeforeLot + 50);
  });

  it('11) [BACKUP & RESTORE ROUND-TRIP] สำรองข้อมูลแบบ VACUUM INTO -> กู้คืน -> ตรวจข้อมูลตรงเดิม 100%', async () => {
    // 11.1) Admin สำรองข้อมูลทันที
    const bkpRes = await request(app)
      .post('/api/backup/run')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(bkpRes.status).toBe(201);
    const filename = bkpRes.body.filename;
    expect(filename).toMatch(/^inthara-.*\.db$/);

    // 11.2) แก้ไขข้อมูลในฐานข้อมูล (จำลองข้อผิดพลาดหรือการเปลี่ยนแปลง)
    db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run('099-000-0000', customerId);
    const modifiedPhone = db.prepare('SELECT phone FROM customers WHERE id = ?').get(customerId).phone;
    expect(modifiedPhone).toBe('099-000-0000');

    // 11.3) Admin สั่ง Restore โดยกรอกรหัสผ่าน Admin
    const restoreRes = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        filename,
        adminPassword: ADMIN_PASS,
      });

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);
    expect(restoreRes.body.preRestoreBackup).toBeDefined();

    // 11.4) ตรวจสอบว่าเบอร์โทรศัพท์ของลูกค้ากลับคืนสู่ค่าเดิม ('055-441-234')
    const currentDb = getDb();
    const restoredPhone = currentDb.prepare('SELECT phone FROM customers WHERE id = ?').get(customerId).phone;
    expect(restoredPhone).toBe('055-441-234');
  });
});
