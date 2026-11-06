import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { hashSecret } from '../../src/modules/auth/service.js';
import {
  calculateCustomerNetDebt,
  calculateFifoSettlement,
} from '../../src/modules/billing/service.js';
import { seedDefaultInventoryItems } from '../../src/modules/inventory/service.js';
import { resetOrderDuplicateWindow } from '../../src/modules/orders/service.js';

describe('Phase 5 — Billing & FIFO Settlement Unit + Integration Tests', () => {
  const app = createApp();
  let adminToken = '';
  let managerToken = '';
  let staffToken = '';
  let driverToken = '';

  beforeAll(async () => {
    runMigrations();
    const db = getDb();

    const users = [
      { username: 'p5_admin', name: 'P5 Admin', role: 'admin', pass: 'AdminPass-99' },
      { username: 'p5_manager', name: 'P5 Manager', role: 'manager', pass: 'ManagerPass-99' },
      { username: 'p5_staff', name: 'P5 Staff', role: 'staff', pass: 'StaffPass-99' },
      { username: 'p5_driver', name: 'P5 Driver', role: 'driver', pass: 'DriverPass-99' },
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

    adminToken = await loginAs('p5_admin', 'AdminPass-99');
    managerToken = await loginAs('p5_manager', 'ManagerPass-99');
    staffToken = await loginAs('p5_staff', 'StaffPass-99');
    driverToken = await loginAs('p5_driver', 'DriverPass-99');

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
  });

  afterAll(() => {
    closeDb();
  });

  describe('Unit Tests — FIFO Settlement & Net Debt Calculation (4 กรณีหลัก + FIN-5)', () => {
    const sampleOrders = [
      { id: 101, code: 'ORD-001', total_sat: 10000, paid_sat: 0, completed_at: '2026-10-01 08:00:00' },
      { id: 102, code: 'ORD-002', total_sat: 20000, paid_sat: 0, completed_at: '2026-10-02 08:00:00' },
      { id: 103, code: 'ORD-003', total_sat: 30000, paid_sat: 0, completed_at: '2026-10-03 08:00:00' },
    ];

    it('กรณีที่ 1: จ่ายครบพอดี (Full Settlement) ปิดครบทุกรายการและไม่มีเงินเกิน', () => {
      const res = calculateFifoSettlement({
        orders: sampleOrders,
        currentDepositSat: 0,
        amountSat: 60000,
        useDepositSat: 0,
      });

      expect(res.settledOrders).toHaveLength(3);
      expect(res.settledOrders.map((o) => ({ id: o.id, paidSat: o.paidSat, closed: o.closed }))).toEqual([
        { id: 101, paidSat: 10000, closed: true },
        { id: 102, paidSat: 20000, closed: true },
        { id: 103, paidSat: 30000, closed: true },
      ]);
      expect(res.excessToDepositSat).toBe(0);
      expect(res.newDepositBalanceSat).toBe(0);
    });

    it('กรณีที่ 2: จ่ายไม่ครบ (Partial Settlement) ปิดออเดอร์เก่าก่อนเรียงตาม completed_at', () => {
      // ส่งออเดอร์สลับลำดับเข้าไป เพื่อพิสูจน์ว่าเรียง FIFO ตาม completed_at เสมอ
      const shuffled = [sampleOrders[2], sampleOrders[0], sampleOrders[1]];
      const res = calculateFifoSettlement({
        orders: shuffled,
        currentDepositSat: 0,
        amountSat: 25000,
        useDepositSat: 0,
      });

      expect(res.settledOrders).toHaveLength(2);
      expect(res.settledOrders[0]).toMatchObject({ id: 101, paidSat: 10000, closed: true });
      expect(res.settledOrders[1]).toMatchObject({
        id: 102,
        paidSat: 15000,
        remainingUnpaidSat: 5000,
        closed: false,
      });
      expect(res.excessToDepositSat).toBe(0);
    });

    it('กรณีที่ 3: ใช้ deposit ผสมกับเงินสด (Mixed Deposit + Cash)', () => {
      const res = calculateFifoSettlement({
        orders: sampleOrders,
        currentDepositSat: 5000,
        amountSat: 30000,
        useDepositSat: 5000,
      });

      expect(res.totalBudgetSat).toBe(35000);
      expect(res.settledOrders).toHaveLength(3);
      expect(res.settledOrders.map((o) => ({ id: o.id, paidSat: o.paidSat, closed: o.closed }))).toEqual([
        { id: 101, paidSat: 10000, closed: true },
        { id: 102, paidSat: 20000, closed: true },
        { id: 103, paidSat: 5000, closed: false },
      ]);
      expect(res.newDepositBalanceSat).toBe(0);
    });

    it('กรณีที่ 4: ยอดจ่ายเกินหนี้ทั้งหมด (Overpayment) → ส่วนเกินเข้า deposit ไม่สูญหาย + กันยอดติดลบ (FIN-5)', () => {
      const singleOrder = [
        { id: 201, code: 'ORD-201', total_sat: 10000, paid_sat: 0, completed_at: '2026-10-05 10:00:00' },
      ];
      const res = calculateFifoSettlement({
        orders: singleOrder,
        currentDepositSat: 2000,
        amountSat: 15000,
        useDepositSat: 0,
      });

      expect(res.settledOrders).toHaveLength(1);
      expect(res.settledOrders[0]).toMatchObject({ id: 201, paidSat: 10000, closed: true });
      expect(res.excessToDepositSat).toBe(5000);
      expect(res.newDepositBalanceSat).toBe(7000); // 2000 เดิม + 5000 ส่วนเกิน

      // ตรวจการคำนวณหนี้สุทธิไม่ติดลบเมื่อ deposit มากกว่าหนี้ (FIN-5)
      const debt = calculateCustomerNetDebt({
        totalOrderSat: 10000,
        paidOrderSat: 8000,
        depositBalanceSat: 5000,
      });
      expect(debt.grossUnpaidSat).toBe(2000);
      expect(debt.netDebtSat).toBe(0);
    });
  });

  describe('Integration Tests — Deposit, Unpaid Aging, FIFO Settle, Slips & DB Verification', () => {
    /**
     * Helper สร้างลูกค้า + สร้างออเดอร์ + เช็คอินเป็นเครดิต เพื่อจำลองออเดอร์ delivered ค้างชำระ
     */
    async function createCustomerWithUnpaidOrders(name, orderAmountsSat = [], completedAtList = []) {
      const db = getDb();
      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name,
          customerType: 'shop',
          zone: 'สาย A - ในเมือง',
          phone: '0891112222',
          prices: {
            'FG-189L': 10000, // ถังละ 100 บาท (10,000 สตางค์)
            'FG-350ML': 3500,
            'FG-600ML': 3800,
            'FG-1500ML': 4000,
          },
        });
      expect(custRes.status).toBe(201);
      const customerId = custRes.body.data.id;

      const createdOrders = [];
      for (let i = 0; i < orderAmountsSat.length; i += 1) {
        const targetSat = orderAmountsSat[i];
        const qty = Math.max(1, Math.round(targetSat / 10000));
        resetOrderDuplicateWindow();

        const ordRes = await request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${staffToken}`)
          .send({
            customerId,
            deliveryDate: `2026-10-${String(i + 1).padStart(2, '0')}`,
            paymentMode: 'credit',
            items: [{ sku: 'FG-189L', qty }],
          });
        expect(ordRes.status).toBe(201);
        const orderId = ordRes.body.data.id;

        const ckRes = await request(app)
          .post('/api/checkins')
          .set('Authorization', `Bearer ${driverToken}`)
          .send({
            orderId,
            delivered: { 'FG-189L': qty },
            returned189L: qty,
            paymentMode: 'credit',
            moneyReceivedSat: 0,
          });
        expect(ckRes.status).toBe(201);

        if (completedAtList[i]) {
          db.prepare('UPDATE orders SET completed_at = ? WHERE id = ?').run(
            completedAtList[i],
            orderId,
          );
        }

        createdOrders.push({ id: orderId, code: ordRes.body.data.code, totalSat: targetSat });
      }

      return { customerId, createdOrders };
    }

    it('1) Deposit (FIN-1): POST /api/customers/:id/deposit บันทึก in/use/refund ลง DB + ห้ามใช้เกิน balance (400)', async () => {
      const db = getDb();
      const { customerId } = await createCustomerWithUnpaidOrders('ลูกค้าทดสอบมัดจำ FIN-1', []);

      // 1.1 รับเงินมัดจำ 5000 satang
      const inRes = await request(app)
        .post(`/api/customers/${customerId}/deposit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ type: 'in', amountSat: 5000, note: 'รับมัดจำเริ่มต้น' });
      expect(inRes.status).toBe(200);
      expect(inRes.body.balanceSat).toBe(5000);

      // ตรวจใน DB ตรงๆ
      expect(
        db.prepare('SELECT balance_sat FROM customers WHERE id = ?').get(customerId).balance_sat,
      ).toBe(5000);
      const ledgerIn = db
        .prepare(
          "SELECT * FROM customer_ledger WHERE customer_id = ? AND entry_type = 'deposit_in'",
        )
        .get(customerId);
      expect(ledgerIn).toBeTruthy();
      expect(ledgerIn.amount_sat).toBe(5000);

      // 1.2 พยายามใช้ deposit เกิน balance (มี 5000 ใช้ 6000) -> 400 + DB ไม่เปลี่ยน
      const overUseRes = await request(app)
        .post(`/api/customers/${customerId}/deposit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ type: 'use', amountSat: 6000, note: 'หักเกินยอด' });
      expect(overUseRes.status).toBe(400);
      expect(
        db.prepare('SELECT balance_sat FROM customers WHERE id = ?').get(customerId).balance_sat,
      ).toBe(5000);

      // 1.3 คืนเงินมัดจำ (refund) 2000 satang -> เหลือ 3000 satang
      const refundRes = await request(app)
        .post(`/api/customers/${customerId}/deposit`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ type: 'refund', amountSat: 2000, note: 'คืนเงินมัดจำบางส่วน' });
      expect(refundRes.status).toBe(200);
      expect(refundRes.body.balanceSat).toBe(3000);
      expect(
        db.prepare('SELECT balance_sat FROM customers WHERE id = ?').get(customerId).balance_sat,
      ).toBe(3000);
    });

    it('2) FIFO Settle (FIN-3): ออเดอร์ค้าง 3 รายการ (10000/20000/30000 sat) + deposit 5000 → ตรวจ DB ครบทุกตาราง', async () => {
      const db = getDb();

      // กรณี ก: ยอดรวมที่ใช้ตัดหนี้ = 35000 sat (เงินสด 30000 + deposit 5000) -> รายการ 1,2 ปิดเต็ม, รายการ 3 paid_sat=5000
      const caseA = await createCustomerWithUnpaidOrders(
        'ลูกค้าทดสอบ FIFO 35k',
        [10000, 20000, 30000],
        ['2026-10-01 09:00:00', '2026-10-02 09:00:00', '2026-10-03 09:00:00'],
      );
      await request(app)
        .post(`/api/customers/${caseA.customerId}/deposit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ type: 'in', amountSat: 5000, note: 'ฝากมัดจำ 5000' });

      const settleResA = await request(app)
        .post('/api/billing/settle')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId: caseA.customerId,
          amountSat: 30000,
          useDepositSat: 5000,
          method: 'cash',
          note: 'ปิดยอด 30000 + มัดจำ 5000',
        });
      expect(settleResA.status).toBe(200);
      expect(settleResA.body.settledOrders).toHaveLength(3);
      expect(
        settleResA.body.settledOrders.map((o) => ({
          id: o.id,
          paidSat: o.paidSat,
          closed: o.closed,
        })),
      ).toEqual([
        { id: caseA.createdOrders[0].id, paidSat: 10000, closed: true },
        { id: caseA.createdOrders[1].id, paidSat: 20000, closed: true },
        { id: caseA.createdOrders[2].id, paidSat: 5000, closed: false },
      ]);

      // ตรวจ DB ตรงๆ สำหรับกรณี ก
      const dbOrdersA = db
        .prepare('SELECT id, total_sat, paid_sat FROM orders WHERE customer_id = ? ORDER BY id ASC')
        .all(caseA.customerId);
      expect(dbOrdersA).toEqual([
        { id: caseA.createdOrders[0].id, total_sat: 10000, paid_sat: 10000 },
        { id: caseA.createdOrders[1].id, total_sat: 20000, paid_sat: 20000 },
        { id: caseA.createdOrders[2].id, total_sat: 30000, paid_sat: 5000 },
      ]);
      expect(
        db.prepare('SELECT balance_sat FROM customers WHERE id = ?').get(caseA.customerId)
          .balance_sat,
      ).toBe(0);

      // กรณี ข: ส่ง amountSat=40000 + useDepositSat=5000 (รวมพลังตัดหนี้ 45000 sat)
      const caseB = await createCustomerWithUnpaidOrders(
        'ลูกค้าทดสอบ FIFO 40k+5k',
        [10000, 20000, 30000],
        ['2026-10-01 09:00:00', '2026-10-02 09:00:00', '2026-10-03 09:00:00'],
      );
      await request(app)
        .post(`/api/customers/${caseB.customerId}/deposit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ type: 'in', amountSat: 5000, note: 'ฝากมัดจำ 5000' });

      const settleResB = await request(app)
        .post('/api/billing/settle')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId: caseB.customerId,
          amountSat: 40000,
          useDepositSat: 5000,
          method: 'transfer',
          note: 'โอนปิดยอด 40000 + ใช้มัดจำ 5000',
        });

      expect(settleResB.status).toBe(200);
      expect(settleResB.body.settledOrders).toHaveLength(3);
      expect(
        settleResB.body.settledOrders.map((o) => ({
          id: o.id,
          paidSat: o.paidSat,
          closed: o.closed,
        })),
      ).toEqual([
        { id: caseB.createdOrders[0].id, paidSat: 10000, closed: true },
        { id: caseB.createdOrders[1].id, paidSat: 20000, closed: true },
        { id: caseB.createdOrders[2].id, paidSat: 15000, closed: false },
      ]);

      // ตรวจ DB ตรงๆ สำหรับกรณี ข:
      // 1) orders: รายการ 1,2 ปิดเต็ม, รายการ 3 paid_sat = 15000
      const dbOrdersB = db
        .prepare('SELECT id, total_sat, paid_sat FROM orders WHERE customer_id = ? ORDER BY id ASC')
        .all(caseB.customerId);
      expect(dbOrdersB).toEqual([
        { id: caseB.createdOrders[0].id, total_sat: 10000, paid_sat: 10000 },
        { id: caseB.createdOrders[1].id, total_sat: 20000, paid_sat: 20000 },
        { id: caseB.createdOrders[2].id, total_sat: 30000, paid_sat: 15000 },
      ]);

      // 2) customers.balance_sat = 0
      expect(
        db.prepare('SELECT balance_sat FROM customers WHERE id = ?').get(caseB.customerId)
          .balance_sat,
      ).toBe(0);

      // 3) payment_receipts สร้าง 1 ใบ (40000 sat)
      const receiptsB = db
        .prepare('SELECT * FROM payment_receipts WHERE customer_id = ?')
        .all(caseB.customerId);
      expect(receiptsB).toHaveLength(1);
      expect(receiptsB[0].amount_sat).toBe(40000);
      expect(receiptsB[0].method).toBe('transfer');

      // 4) customer_ledger มี deposit_use 5000 + payment 40000 อ้างอิงใบเสร็จนี้
      const receiptLedgersB = db
        .prepare(
          "SELECT entry_type, amount_sat FROM customer_ledger WHERE customer_id = ? AND ref_type = 'receipt' AND ref_id = ? ORDER BY id ASC",
        )
        .all(caseB.customerId, receiptsB[0].code);
      expect(receiptLedgersB).toEqual([
        { entry_type: 'deposit_use', amount_sat: 5000 },
        { entry_type: 'payment', amount_sat: 40000 },
      ]);
    });

    it('3) Overpayment Settle (FIN-3): หนี้ 10000 จ่าย 15000 → 5000 เข้า deposit + ledger บันทึก deposit_in', async () => {
      const db = getDb();
      const { customerId, createdOrders } = await createCustomerWithUnpaidOrders(
        'ลูกค้าจ่ายเกินหนี้',
        [10000],
        ['2026-10-10 10:00:00'],
      );

      const settleRes = await request(app)
        .post('/api/billing/settle')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          amountSat: 15000,
          useDepositSat: 0,
          method: 'cash',
          note: 'ลูกค้าจ่ายแบงก์ใหญ่ เก็บส่วนเกินเข้ามัดจำ',
        });

      expect(settleRes.status).toBe(200);
      expect(settleRes.body.settledOrders).toEqual([
        expect.objectContaining({
          id: createdOrders[0].id,
          paidSat: 10000,
          closed: true,
        }),
      ]);
      expect(settleRes.body.excessToDepositSat).toBe(5000);
      expect(settleRes.body.customerBalance.balanceSat).toBe(5000);

      // ตรวจ DB ตรงๆ:
      // 1) ออเดอร์ปิดเต็ม paid_sat = 10000
      const orderRow = db
        .prepare('SELECT total_sat, paid_sat FROM orders WHERE id = ?')
        .get(createdOrders[0].id);
      expect(orderRow).toEqual({ total_sat: 10000, paid_sat: 10000 });

      // 2) customers.balance_sat = 5000
      const custRow = db
        .prepare('SELECT balance_sat FROM customers WHERE id = ?')
        .get(customerId);
      expect(custRow.balance_sat).toBe(5000);

      // 3) customer_ledger มี payment = 15000 และ deposit_in = 5000
      const ledgerRows = db
        .prepare(
          "SELECT entry_type, amount_sat FROM customer_ledger WHERE customer_id = ? AND ref_type = 'receipt' ORDER BY id ASC",
        )
        .all(customerId);
      expect(ledgerRows).toEqual([
        { entry_type: 'payment', amount_sat: 15000 },
        { entry_type: 'deposit_in', amount_sat: 5000 },
      ]);
    });

    it('4) Aging Filter (FIN-2) & Slips (FIN-4): ออเดอร์ย้อน completed_at 35 วัน โผล่ใน unpaid30 แต่ไม่โผล่ใน unpaid60 + ตรวจสลิป', async () => {
      const db = getDb();
      const { customerId, createdOrders } = await createCustomerWithUnpaidOrders(
        'ลูกค้าทดสอบอายุหนี้ 35 วัน',
        [20000],
      );
      const order35Id = createdOrders[0].id;

      // ย้อน completed_at ไป 35 วันใน SQLite
      db.prepare("UPDATE orders SET completed_at = datetime('now', '-35 days') WHERE id = ?").run(
        order35Id,
      );

      // เติม deposit 3000 sat เพื่อตรวจสูตรยอดหนี้ต่อลูกค้า = 20000 - 0 - 3000 = 17000
      await request(app)
        .post(`/api/customers/${customerId}/deposit`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ type: 'in', amountSat: 3000, note: 'มัดจำลดหนี้' });

      // 4.1 ตรวจ unpaid30 -> ต้องเจอ order35Id
      const unpaid30Res = await request(app)
        .get(`/api/billing/unpaid?aging=unpaid30&customerId=${customerId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(unpaid30Res.status).toBe(200);
      const idsIn30 = unpaid30Res.body.items.map((o) => o.id);
      expect(idsIn30).toContain(order35Id);
      expect(unpaid30Res.body.items[0].ageDays).toBeGreaterThanOrEqual(35);
      expect(unpaid30Res.body.customers[0].netDebtSat).toBe(17000);

      // 4.2 ตรวจ unpaid60 -> ต้องไม่เจอ order35Id
      const unpaid60Res = await request(app)
        .get(`/api/billing/unpaid?aging=unpaid60&customerId=${customerId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(unpaid60Res.status).toBe(200);
      const idsIn60 = unpaid60Res.body.items.map((o) => o.id);
      expect(idsIn60).not.toContain(order35Id);

      // 4.3 ตรวจสลิปสรุปประวัติค้างชำระ GET /api/billing/history-slip/:customerId
      const histSlipRes = await request(app)
        .get(`/api/billing/history-slip/${customerId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(histSlipRes.status).toBe(200);
      expect(histSlipRes.body.summary.grossUnpaidSat).toBe(20000);
      expect(histSlipRes.body.summary.depositBalanceSat).toBe(3000);
      expect(histSlipRes.body.summary.netDebtSat).toBe(17000);

      // 4.4 ปิดบิลบางส่วนแล้วตรวจ GET /api/billing/slip/:receiptId
      const settleRes = await request(app)
        .post('/api/billing/settle')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          customerId,
          amountSat: 7000,
          useDepositSat: 3000,
          method: 'cash',
        });
      expect(settleRes.status).toBe(200);
      const receiptId = settleRes.body.receipt.id;

      const receiptSlipRes = await request(app)
        .get(`/api/billing/slip/${receiptId}`)
        .set('Authorization', `Bearer ${driverToken}`);
      expect(receiptSlipRes.status).toBe(200);
      expect(receiptSlipRes.body.slipNo).toBe(settleRes.body.receipt.code);
      expect(receiptSlipRes.body.summary.receiptAmountSat).toBe(7000);
      expect(receiptSlipRes.body.summary.usedDepositSat).toBe(3000);
      expect(receiptSlipRes.body.summary.remainingNetDebtSat).toBe(10000);
    });
  });
});
