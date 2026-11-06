import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashSecret } from '../../src/modules/auth/service.js';
import { seedDefaultInventoryItems } from '../../src/modules/inventory/service.js';
import { resetOrderDuplicateWindow } from '../../src/modules/orders/service.js';

describe('Phase 4 — Delivery Check-in + Stock Movement (/api/checkins & /api/inventory)', () => {
  const app = createApp();
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let driverToken = '';
  let testCustomerId = 0;

  beforeAll(async () => {
    runMigrations();
    const db = getDb();

    const users = [
      { username: 'p4_admin', name: 'P4 Admin', role: 'admin', pass: 'AdminPass-99' },
      { username: 'p4_manager', name: 'P4 Manager', role: 'manager', pass: 'ManagerPass-99' },
      { username: 'p4_staff', name: 'P4 Staff', role: 'staff', pass: 'StaffPass-99' },
      { username: 'p4_driver', name: 'P4 Driver', role: 'driver', pass: 'DriverPass-99' },
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

    adminToken = await loginAs('p4_admin', 'AdminPass-99');
    managerToken = await loginAs('p4_manager', 'ManagerPass-99');
    staffToken = await loginAs('p4_staff', 'StaffPass-99');
    driverToken = await loginAs('p4_driver', 'DriverPass-99');

    // Seed 5 SKU หลัก
    seedDefaultInventoryItems(
      {
        'FG-189L': 200,
        'FG-350ML': 100,
        'FG-600ML': 100,
        'FG-1500ML': 100,
        'RET-189L-EMPTY': 50,
      },
      { overwrite: true },
    );

    // สร้างลูกค้าสำหรับทดสอบ (ราคาถัง 18.9L = 15000 สต. = 150 บาท, ถังค้างเริ่มต้น = 0)
    const custRes = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'ร้านน้ำดื่มทดสอบ Phase 4',
        customerType: 'shop',
        zone: 'สาย A - ในเมือง',
        phone: '0812223333',
        prices: {
          'FG-189L': 15000,
          'FG-350ML': 3500,
          'FG-600ML': 3800,
          'FG-1500ML': 4000,
        },
      });
    expect(custRes.status).toBe(201);
    testCustomerId = custRes.body.data.id;
  });

  afterAll(() => {
    closeDb();
  });

  it('1) Inventory API: GET /api/inventory/items คืนค่า belowMin ถูกต้อง + POST /api/inventory/adjust บันทึก stock_movements (reason=adjustment)', async () => {
    // ปรับ FG-350ML ให้เหลือ 10 (ต่ำกว่า min_stock = 30)
    const adjRes = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        sku: 'FG-350ML',
        newStock: 10,
        reason: 'ตรวจนับสต็อกประจำสัปดาห์',
      });

    expect(adjRes.status).toBe(200);
    expect(adjRes.body.item.sku).toBe('FG-350ML');
    expect(adjRes.body.item.stock).toBe(10);
    expect(adjRes.body.item.belowMin).toBe(true);
    expect(adjRes.body.movement.reason).toBe('adjustment');
    expect(adjRes.body.movement.qtyChange).toBe(-90);

    // ตรวจสอบรายการสต็อกทั้งหมดและตัวกรอง lowStockOnly
    const listRes = await request(app)
      .get('/api/inventory/items?lowStockOnly=true')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(listRes.status).toBe(200);
    const lowSkus = listRes.body.items.map((i) => i.sku);
    expect(lowSkus).toContain('FG-350ML');

    // ปรับ FG-350ML กลับเป็น 100
    const restoreRes = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'FG-350ML',
        newStock: 100,
        reason: 'เติมสต็อกกลับ',
      });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.item.stock).toBe(100);
    expect(restoreRes.body.item.belowMin).toBe(false);

    // ตรวจสอบ GET /api/inventory/movements
    const movRes = await request(app)
      .get('/api/inventory/movements?sku=FG-350ML&reason=adjustment')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(movRes.status).toBe(200);
    expect(movRes.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('2) Check-in ออเดอร์ FG-189L 10 ถัง คืนถังเปล่า 2 เงินสด → ตรวจครบทั้ง 5 ผลลัพธ์ใน DB', async () => {
    const db = getDb();

    // ตั้งค่าเริ่มต้นให้ชัดเจน: FG-189L = 100, RET-189L-EMPTY = 50, ลูกค้า outstanding_bottles = 0
    db.prepare('UPDATE inventory_items SET stock = 100 WHERE sku = ?').run('FG-189L');
    db.prepare('UPDATE inventory_items SET stock = 50 WHERE sku = ?').run('RET-189L-EMPTY');
    db.prepare('UPDATE customers SET outstanding_bottles = 0 WHERE id = ?').run(testCustomerId);

    resetOrderDuplicateWindow();
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: testCustomerId,
        deliveryDate: '2026-11-06',
        paymentMode: 'cash',
        items: [{ sku: 'FG-189L', qty: 10 }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    // พนักงานขับรถกด Check-in: ส่ง FG-189L 10 ถัง, รับคืนถังเปล่า 2 ถัง, เงินสด 150,000 สตางค์
    const checkinRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        delivered: { 'FG-189L': 10 },
        returned189L: 2,
        paymentMode: 'cash',
        moneyReceivedSat: 150000,
        notes: 'ส่งเรียบร้อย ลูกค้าจ่ายสดครบ',
      });

    expect(checkinRes.status).toBe(201);
    const checkinId = checkinRes.body.checkin.id;

    // (1) ตรวจออเดอร์ใน DB: status = 'delivered' + completed_at มีค่า + delivered_qty = 10, returned_qty = 2
    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(orderRow.status).toBe('delivered');
    expect(orderRow.completed_at).toBeTruthy();
    expect(orderRow.total_sat).toBe(150000);
    expect(orderRow.paid_sat).toBe(150000);

    const orderItemRow = db
      .prepare('SELECT * FROM order_items WHERE order_id = ? AND sku = ?')
      .get(orderId, 'FG-189L');
    expect(orderItemRow.delivered_qty).toBe(10);
    expect(orderItemRow.returned_qty).toBe(2);

    // (2) ตรวจสต็อกใน DB: FG-189L ลด 10 (100 -> 90), RET-189L-EMPTY เพิ่ม 2 (50 -> 52)
    const fgRow = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L');
    const emptyRow = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('RET-189L-EMPTY');
    expect(fgRow.stock).toBe(90);
    expect(emptyRow.stock).toBe(52);

    // (3) ตรวจถังค้างลูกค้าใน DB: outstanding_bottles = 8 (0 + 10 - 2)
    const custRow = db
      .prepare('SELECT outstanding_bottles FROM customers WHERE id = ?')
      .get(testCustomerId);
    expect(custRow.outstanding_bottles).toBe(8);

    // (4) ตรวจ stock_movements ใน DB: มี 2 แถวของ checkin นี้ (order_out = -10 และ checkin_return = +2)
    const movements = db
      .prepare(
        'SELECT sku, qty_change, reason FROM stock_movements WHERE ref_type = ? AND ref_id = ? ORDER BY id ASC',
      )
      .all('checkin', String(checkinId));
    expect(movements).toHaveLength(2);
    expect(movements[0]).toEqual({
      sku: 'FG-189L',
      qty_change: -10,
      reason: 'order_out',
    });
    expect(movements[1]).toEqual({
      sku: 'RET-189L-EMPTY',
      qty_change: 2,
      reason: 'checkin_return',
    });

    // (5) ตรวจ payment_receipts + customer_ledger ใน DB
    const receiptRow = db
      .prepare('SELECT * FROM payment_receipts WHERE checkin_id = ?')
      .get(checkinId);
    expect(receiptRow).toBeTruthy();
    expect(receiptRow.amount_sat).toBe(150000);
    expect(receiptRow.code).toMatch(/^RCP-261106-\d{3}$/);

    const ledgerRow = db
      .prepare('SELECT * FROM customer_ledger WHERE ref_type = ? AND ref_id = ?')
      .get('receipt', receiptRow.code);
    expect(ledgerRow).toBeTruthy();
    expect(ledgerRow.entry_type).toBe('payment');
    expect(ledgerRow.amount_sat).toBe(150000);

    // ตรวจใบสลิป GET /api/checkins/slip/:checkinId
    const slipRes = await request(app)
      .get(`/api/checkins/slip/${checkinId}`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(slipRes.status).toBe(200);
    expect(slipRes.body.slipNo).toBe(receiptRow.code);
    expect(slipRes.body.summary.outstandingBottlesAfter).toBe(8);
  });

  it('3) Check-in ซ้ำในออเดอร์ที่ delivered ไปแล้ว → 409 CONFLICT', async () => {
    const listRes = await request(app)
      .get('/api/orders?status=delivered')
      .set('Authorization', `Bearer ${driverToken}`);
    const ordersList = listRes.body.data ?? listRes.body.items ?? [];
    const deliveredOrder = ordersList[0];
    expect(deliveredOrder).toBeTruthy();

    const dupCheckinRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId: deliveredOrder.id,
        delivered: { 'FG-189L': 5 },
        returned189L: 1,
        paymentMode: 'cash',
      });

    expect(dupCheckinRes.status).toBe(409);
    expect(dupCheckinRes.body.error.code).toBe('CONFLICT');
  });

  it('4) สต็อกไม่พอ (FG มี 10 ส่ง 100) หรือ SKU ไม่มี → 400 + Atomic Rollback 100% ทุกตาราง', async () => {
    const db = getDb();

    // ตั้งสต็อก FG-189L = 10, RET-189L-EMPTY = 52
    db.prepare('UPDATE inventory_items SET stock = 10 WHERE sku = ?').run('FG-189L');

    resetOrderDuplicateWindow();
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: testCustomerId,
        deliveryDate: '2026-11-06',
        paymentMode: 'cash',
        items: [{ sku: 'FG-189L', qty: 100 }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    // เก็บ snapshot ก่อนยิง check-in ที่สต็อกไม่พอ
    const beforeOrder = db.prepare('SELECT status, completed_at FROM orders WHERE id = ?').get(orderId);
    const beforeFgStock = db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock;
    const beforeEmptyStock = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('RET-189L-EMPTY').stock;
    const beforeBottles = db
      .prepare('SELECT outstanding_bottles FROM customers WHERE id = ?')
      .get(testCustomerId).outstanding_bottles;
    const beforeMovementsCount = db.prepare('SELECT COUNT(*) AS c FROM stock_movements').get().c;
    const beforeReceiptsCount = db.prepare('SELECT COUNT(*) AS c FROM payment_receipts').get().c;
    const beforeLedgerCount = db.prepare('SELECT COUNT(*) AS c FROM customer_ledger').get().c;

    // กรณี 4.1: สต็อกไม่พอ (มี 10 ส่ง 100)
    const failRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        delivered: { 'FG-189L': 100 },
        returned189L: 5,
        paymentMode: 'cash',
      });

    expect(failRes.status).toBe(400);
    expect(failRes.body.error.message).toContain('FG-189L');

    // ยืนยันว่าทุกตารางไม่ขยับแม้แต่แถวเดียว (Atomic Rollback)
    const afterOrder = db.prepare('SELECT status, completed_at FROM orders WHERE id = ?').get(orderId);
    expect(afterOrder).toEqual(beforeOrder);
    expect(afterOrder.status).not.toBe('delivered');
    expect(afterOrder.completed_at).toBeNull();
    expect(db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('FG-189L').stock).toBe(
      beforeFgStock,
    );
    expect(
      db.prepare('SELECT stock FROM inventory_items WHERE sku = ?').get('RET-189L-EMPTY').stock,
    ).toBe(beforeEmptyStock);
    expect(
      db.prepare('SELECT outstanding_bottles FROM customers WHERE id = ?').get(testCustomerId)
        .outstanding_bottles,
    ).toBe(beforeBottles);
    expect(db.prepare('SELECT COUNT(*) AS c FROM stock_movements').get().c).toBe(
      beforeMovementsCount,
    );
    expect(db.prepare('SELECT COUNT(*) AS c FROM payment_receipts').get().c).toBe(
      beforeReceiptsCount,
    );
    expect(db.prepare('SELECT COUNT(*) AS c FROM customer_ledger').get().c).toBe(beforeLedgerCount);

    // กรณี 4.2: SKU ไม่มีใน inventory_items
    const missingSkuRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        delivered: { 'FG-NON-EXISTENT': 2 },
        returned189L: 0,
        paymentMode: 'cash',
      });

    expect(missingSkuRes.status).toBe(400);
    expect(missingSkuRes.body.error.message).toContain('FG-NON-EXISTENT');
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId).status).toBe(
      beforeOrder.status,
    );
  });

  it('5) โหมดเครดิต (moneyReceivedSat < total) → customer_ledger บันทึก order_debt ตามส่วนต่าง', async () => {
    const db = getDb();
    db.prepare('UPDATE inventory_items SET stock = 500 WHERE sku = ?').run('FG-189L');

    resetOrderDuplicateWindow();
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: testCustomerId,
        deliveryDate: '2026-11-07',
        paymentMode: 'credit',
        items: [{ sku: 'FG-189L', qty: 10 }], // ยอดรวม 150,000 สตางค์
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;
    const orderCode = orderRes.body.data.code;

    // จ่ายบางส่วน 50,000 สตางค์ ค้างชำระ 100,000 สตางค์
    const creditRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        delivered: { 'FG-189L': 10 },
        returned189L: 10,
        paymentMode: 'credit',
        moneyReceivedSat: 50000,
        notes: 'จ่ายบางส่วน 500 บาท ที่เหลือลงบัญชีค้างชำระ',
      });

    expect(creditRes.status).toBe(201);
    expect(creditRes.body.customerBalance.unpaidOrderDebtSat).toBe(100000);

    // ตรวจสอบ customer_ledger ว่ามี order_debt = 100000 อ้างอิง orderCode
    const debtRow = db
      .prepare(
        'SELECT * FROM customer_ledger WHERE customer_id = ? AND entry_type = ? AND ref_id = ?',
      )
      .get(testCustomerId, 'order_debt', orderCode);

    expect(debtRow).toBeTruthy();
    expect(debtRow.amount_sat).toBe(100000);
  });

  it('6) Concurrency (NFR-2): ยิง POST /api/checkins พร้อมกัน 10 ออเดอร์ (Promise.all) → สำเร็จครบและสต็อก/ยอดเงินตรง 100%', async () => {
    const db = getDb();

    // ตั้งค่าเริ่มต้น: FG-189L = 1000, RET-189L-EMPTY = 100, outstanding_bottles = 20
    db.prepare('UPDATE inventory_items SET stock = 1000 WHERE sku = ?').run('FG-189L');
    db.prepare('UPDATE inventory_items SET stock = 100 WHERE sku = ?').run('RET-189L-EMPTY');
    db.prepare('UPDATE customers SET outstanding_bottles = 20 WHERE id = ?').run(testCustomerId);

    const createdOrderIds = [];
    for (let i = 1; i <= 10; i += 1) {
      resetOrderDuplicateWindow();
      const oRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId: testCustomerId,
          deliveryDate: '2026-11-08',
          paymentMode: 'cash',
          items: [{ sku: 'FG-189L', qty: i }], // 1..10 ถัง (รวม 55 ถัง)
        });
      expect(oRes.status).toBe(201);
      createdOrderIds.push({ orderId: oRes.body.data.id, qty: i });
    }

    // ยิง POST /api/checkins พร้อมกันทั้ง 10 ออเดอร์ด้วย Promise.all
    // แต่ละออเดอร์ส่ง FG-189L = qty (รวม 55 ถัง), คืนถังเปล่า = 1 ถัง (รวม 10 ถัง)
    const responses = await Promise.all(
      createdOrderIds.map(({ orderId, qty }) =>
        request(app)
          .post('/api/checkins')
          .set('Authorization', `Bearer ${driverToken}`)
          .send({
            orderId,
            delivered: { 'FG-189L': qty },
            returned189L: 1,
            paymentMode: 'cash',
          }),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    // ตรวจสอบความถูกต้องของสต็อกและถังค้างหลังยิงพร้อมกัน 10 รายการ
    // FG-189L: 1000 - 55 = 945
    // RET-189L-EMPTY: 100 + 10 = 110
    // ลูกค้า outstanding_bottles: 20 + 55 - 10 = 65
    const finalFgStock = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('FG-189L').stock;
    const finalEmptyStock = db
      .prepare('SELECT stock FROM inventory_items WHERE sku = ?')
      .get('RET-189L-EMPTY').stock;
    const finalBottles = db
      .prepare('SELECT outstanding_bottles FROM customers WHERE id = ?')
      .get(testCustomerId).outstanding_bottles;

    expect(finalFgStock).toBe(945);
    expect(finalEmptyStock).toBe(110);
    expect(finalBottles).toBe(65);

    // ตรวจสอบว่ารหัสใบเสร็จทั้ง 10 ใบไม่ซ้ำกันเลย
    const receiptCodes = new Set(responses.map((r) => r.body.receipt.code));
    expect(receiptCodes.size).toBe(10);
  });

  it('7) ปฏิเสธจำนวนส่งหรือถังคืนติดลบ (400) + ตรวจ RBAC ของ Inventory API + GET /api/checkins', async () => {
    resetOrderDuplicateWindow();
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerId: testCustomerId,
        deliveryDate: '2026-11-09',
        paymentMode: 'cash',
        items: [{ sku: 'FG-189L', qty: 5 }],
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;

    // จำนวนส่งติดลบ -> 400
    const negDeliveredRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        delivered: { 'FG-189L': -5 },
        returned189L: 0,
        paymentMode: 'cash',
      });
    expect(negDeliveredRes.status).toBe(400);

    // จำนวนถังคืนติดลบ -> 400
    const negReturnedRes = await request(app)
      .post('/api/checkins')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        orderId,
        delivered: { 'FG-189L': 5 },
        returned189L: -2,
        paymentMode: 'cash',
      });
    expect(negReturnedRes.status).toBe(400);

    // RBAC: driver และ staff ห้ามเรียก POST /api/inventory/adjust หรือ PUT /api/inventory/items/:sku (403)
    const driverAdjRes = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ sku: 'FG-189L', newStock: 500, reason: 'ไม่ควรผ่าน' });
    expect(driverAdjRes.status).toBe(403);

    const staffPutRes = await request(app)
      .put('/api/inventory/items/FG-189L')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ minStock: 60 });
    expect(staffPutRes.status).toBe(403);

    const mgrPutRes = await request(app)
      .put('/api/inventory/items/FG-189L')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ minStock: 60 });
    expect(mgrPutRes.status).toBe(200);
    expect(mgrPutRes.body.item.minStock).toBe(60);

    // GET /api/checkins กรองตาม customerId
    const listCheckinsRes = await request(app)
      .get(`/api/checkins?customerId=${testCustomerId}&limit=5`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(listCheckinsRes.status).toBe(200);
    expect(listCheckinsRes.body.items.length).toBe(5);
    expect(listCheckinsRes.body.meta.total).toBeGreaterThanOrEqual(12);
  });
});
