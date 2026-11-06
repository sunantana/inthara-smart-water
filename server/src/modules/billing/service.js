import { getDb } from '../../db/connection.js';
import { AppError } from '../../utils/errors.js';
import { satangToBaht } from '../../utils/money.js';
import * as customersRepo from '../customers/repo.js';
import { computePaginationMeta, getCustomerById } from '../customers/service.js';
import * as deliveryRepo from '../delivery/repo.js';
import {
  buildReceiptCodePrefix,
  formatReceipt,
  formatReceiptCode,
} from '../delivery/service.js';
import * as repo from './repo.js';

export function deriveAgingBucket(ageDays) {
  const days = Math.max(0, Math.trunc(Number(ageDays ?? 0)));
  if (days >= 90) return 'unpaid90';
  if (days >= 60) return 'unpaid60';
  if (days >= 30) return 'unpaid30';
  return 'current';
}

/**
 * คำนวณยอดหนี้สุทธิของลูกค้า (FIN-2 & FIN-5):
 * ยอดหนี้ต่อลูกค้า = max(0, ยอดออเดอร์ค้าง − เงินที่เก็บแล้ว − deposit คงเหลือ)
 */
export function calculateCustomerNetDebt({
  totalOrderSat = 0,
  paidOrderSat = 0,
  depositBalanceSat = 0,
}) {
  const totalSat = Math.max(0, Math.trunc(Number(totalOrderSat ?? 0)));
  const paidSat = Math.max(0, Math.trunc(Number(paidOrderSat ?? 0)));
  const grossUnpaidSat = Math.max(0, totalSat - paidSat);
  const depositSat = Math.max(0, Math.trunc(Number(depositBalanceSat ?? 0)));
  const netDebtSat = Math.max(0, grossUnpaidSat - depositSat);

  return {
    totalOrderSat: totalSat,
    paidOrderSat: paidSat,
    grossUnpaidSat,
    depositBalanceSat: depositSat,
    netDebtSat,
  };
}

/**
 * ฟังก์ชันคำนวณการแจกแจงปิดหนี้แบบ FIFO (เก่า -> ใหม่ ตาม completed_at) (FIN-3 & FIN-5)
 * แยกเป็น pure function สำหรับทดสอบ unit test ทั้ง 4 กรณี:
 * 1) จ่ายครบพอดี
 * 2) จ่ายไม่ครบ (ปิดบางรายการ + รายการถัดไปจ่ายบางส่วน)
 * 3) ใช้ deposit ผสมกับเงินชำระ
 * 4) ยอดจ่ายเกินหนี้ทั้งหมด -> ส่วนเกินเข้า deposit (ไม่หาย)
 */
export function calculateFifoSettlement({
  orders = [],
  currentDepositSat = 0,
  amountSat = 0,
  useDepositSat = 0,
}) {
  const cleanAmountSat = Math.trunc(Number(amountSat ?? 0));
  const cleanUseDepositSat = Math.trunc(Number(useDepositSat ?? 0));
  const cleanCurrentDepositSat = Math.max(0, Math.trunc(Number(currentDepositSat ?? 0)));

  if (!Number.isFinite(cleanAmountSat) || cleanAmountSat < 0) {
    throw AppError.badRequest('จำนวนเงินที่รับชำระต้องไม่ติดลบ');
  }
  if (!Number.isFinite(cleanUseDepositSat) || cleanUseDepositSat < 0) {
    throw AppError.badRequest('จำนวนเงินมัดจำที่ใช้ต้องไม่ติดลบ');
  }
  if (cleanAmountSat + cleanUseDepositSat <= 0) {
    throw AppError.badRequest('จำนวนเงินที่ชำระรวมกับเงินมัดจำที่ใช้ต้องมากกว่า 0 สตางค์');
  }
  if (cleanUseDepositSat > cleanCurrentDepositSat) {
    throw AppError.badRequest(
      `ยอดเงินมัดจำคงเหลือไม่เพียงพอ (คงเหลือ ${cleanCurrentDepositSat} สต. ต้องการใช้ ${cleanUseDepositSat} สต.)`,
      [
        {
          field: 'useDepositSat',
          available: cleanCurrentDepositSat,
          requested: cleanUseDepositSat,
        },
      ],
    );
  }

  // เรียงออเดอร์เก่า -> ใหม่ ตาม completed_at (FIFO)
  const sortedOrders = [...orders].sort((a, b) => {
    const tA = String(a.completed_at ?? a.completedAt ?? a.delivery_date ?? a.created_at ?? '');
    const tB = String(b.completed_at ?? b.completedAt ?? b.delivery_date ?? b.created_at ?? '');
    if (tA !== tB) return tA.localeCompare(tB);
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });

  const totalBudgetSat = cleanAmountSat + cleanUseDepositSat;
  let remainingBudgetSat = totalBudgetSat;
  let totalAllocatedSat = 0;
  const settledOrders = [];

  for (const order of sortedOrders) {
    const orderTotalSat = Math.max(
      0,
      Math.trunc(Number(order.total_sat ?? order.totalSat ?? 0)),
    );
    const previousPaidSat = Math.max(
      0,
      Math.trunc(Number(order.paid_sat ?? order.paidSat ?? 0)),
    );
    const neededSat = Math.max(0, orderTotalSat - previousPaidSat);

    if (neededSat <= 0 || remainingBudgetSat <= 0) {
      continue;
    }

    const allocatedSat = Math.min(neededSat, remainingBudgetSat);
    const newPaidSat = previousPaidSat + allocatedSat;
    const remainingUnpaidSat = Math.max(0, orderTotalSat - newPaidSat);
    const closed = newPaidSat >= orderTotalSat;

    remainingBudgetSat = Math.max(0, remainingBudgetSat - allocatedSat);
    totalAllocatedSat += allocatedSat;

    settledOrders.push({
      id: Number(order.id),
      orderId: Number(order.id),
      code: order.code ?? null,
      totalSat: orderTotalSat,
      previousPaidSat,
      allocatedSat,
      paidSat: newPaidSat,
      paid_sat: newPaidSat,
      remainingUnpaidSat,
      closed,
    });
  }

  const excessToDepositSat = Math.max(0, remainingBudgetSat);
  const newDepositBalanceSat = Math.max(
    0,
    cleanCurrentDepositSat - cleanUseDepositSat + excessToDepositSat,
  );

  return {
    settledOrders,
    totalBudgetSat,
    totalAllocatedSat,
    excessToDepositSat,
    previousDepositSat: cleanCurrentDepositSat,
    useDepositSat: cleanUseDepositSat,
    newDepositBalanceSat,
    amountSat: cleanAmountSat,
  };
}

export function formatLedgerEntry(row) {
  if (!row) return null;
  const amountSat = Number(row.amount_sat ?? 0);
  const isOutflow =
    row.entry_type === 'deposit_use' || row.entry_type === 'deposit_refund';
  const signedAmountSat = isOutflow ? -Math.abs(amountSat) : amountSat;

  return {
    id: row.id,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    entryType: row.entry_type,
    entry_type: row.entry_type,
    amountSat,
    amount_sat: amountSat,
    amountBaht: satangToBaht(amountSat),
    signedAmountSat,
    refType: row.ref_type ?? null,
    ref_type: row.ref_type ?? null,
    refId: row.ref_id ?? null,
    ref_id: row.ref_id ?? null,
    note: row.note ?? '',
    createdBy: row.created_by ?? null,
    created_by: row.created_by ?? null,
    createdByName: row.created_by_name ?? row.created_by_username ?? null,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

export function formatUnpaidOrderRow(row) {
  if (!row) return null;
  const totalSat = Math.max(0, Number(row.total_sat ?? 0));
  const paidSat = Math.max(0, Number(row.paid_sat ?? 0));
  const unpaidSat = Math.max(0, totalSat - paidSat);
  const ageDays = Math.max(0, Math.trunc(Number(row.age_days ?? 0)));
  const agingBucket = deriveAgingBucket(ageDays);
  const customerDepositSat = Math.max(0, Number(row.customer_balance_sat ?? 0));

  return {
    id: row.id,
    orderId: row.id,
    code: row.code,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    customerCode: row.customer_code ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    zone: row.customer_zone ?? null,
    address: row.customer_address ?? null,
    deliveryDate: row.delivery_date,
    delivery_date: row.delivery_date,
    completedAt: row.completed_at ?? null,
    completed_at: row.completed_at ?? null,
    totalSat,
    total_sat: totalSat,
    totalBaht: satangToBaht(totalSat),
    paidSat,
    paid_sat: paidSat,
    paidBaht: satangToBaht(paidSat),
    unpaidSat,
    unpaid_sat: unpaidSat,
    unpaidBaht: satangToBaht(unpaidSat),
    ageDays,
    age_days: ageDays,
    agingBucket,
    aging_bucket: agingBucket,
    customerDepositSat,
    customer_deposit_sat: customerDepositSat,
    customerOutstandingBottles: Math.max(
      0,
      Number(row.customer_outstanding_bottles ?? 0),
    ),
  };
}

/**
 * 1) Deposit (FIN-1) — POST /api/customers/:id/deposit
 * { type: 'in' | 'use' | 'refund', amountSat, note }
 */
export function recordCustomerDeposit(customerId, payload, actorId = null) {
  const cleanCustomerId = Number(customerId);
  const type = payload.type;
  const amountSat = Math.trunc(Number(payload.amountSat ?? payload.amount_sat ?? 0));
  const note = String(payload.note ?? '').trim();

  if (!['in', 'use', 'refund'].includes(type)) {
    throw AppError.badRequest('ประเภทรายการมัดจำต้องเป็น in, use หรือ refund');
  }
  if (!Number.isInteger(amountSat) || amountSat <= 0) {
    throw AppError.badRequest('จำนวนเงินมัดจำ (amountSat) ต้องเป็นจำนวนเต็มบวก');
  }

  const db = getDb();

  const runDepositTx = db.transaction(() => {
    const customer = customersRepo.findCustomerById(cleanCustomerId, {
      includeInactive: true,
    });
    if (!customer) {
      throw AppError.notFound('ไม่พบข้อมูลลูกค้า');
    }

    const currentBalanceSat = Math.max(0, Number(customer.balance_sat ?? 0));
    let newBalanceSat = currentBalanceSat;
    let entryType = 'deposit_in';
    let defaultNote = '';

    if (type === 'in') {
      newBalanceSat = currentBalanceSat + amountSat;
      entryType = 'deposit_in';
      defaultNote = 'รับเงินมัดจำ/สำรองจ่ายจากลูกค้า';
    } else if (type === 'use') {
      if (amountSat > currentBalanceSat) {
        throw AppError.badRequest(
          `ยอดเงินมัดจำคงเหลือไม่เพียงพอสำหรับการหักใช้ (คงเหลือ ${currentBalanceSat} สต. ต้องการใช้ ${amountSat} สต.)`,
          [
            {
              field: 'amountSat',
              available: currentBalanceSat,
              requested: amountSat,
              issue: 'ยอดมัดจำคงเหลือไม่เพียงพอ',
            },
          ],
        );
      }
      newBalanceSat = Math.max(0, currentBalanceSat - amountSat);
      entryType = 'deposit_use';
      defaultNote = 'หักใช้เงินมัดจำของลูกค้า';
    } else if (type === 'refund') {
      if (amountSat > currentBalanceSat) {
        throw AppError.badRequest(
          `ยอดเงินมัดจำคงเหลือไม่เพียงพอสำหรับการคืนเงิน (คงเหลือ ${currentBalanceSat} สต. ต้องการคืน ${amountSat} สต.)`,
          [
            {
              field: 'amountSat',
              available: currentBalanceSat,
              requested: amountSat,
              issue: 'ยอดมัดจำคงเหลือไม่เพียงพอ',
            },
          ],
        );
      }
      newBalanceSat = Math.max(0, currentBalanceSat - amountSat);
      entryType = 'deposit_refund';
      defaultNote = 'คืนเงินมัดจำให้ลูกค้า';
    }

    repo.updateCustomerBalanceSat(cleanCustomerId, newBalanceSat);

    const ledgerId = repo.insertLedgerEntry({
      customerId: cleanCustomerId,
      entryType,
      amountSat,
      refType: 'deposit',
      refId: String(cleanCustomerId),
      note: note || defaultNote,
      createdBy: actorId,
    });

    const ledgerEntry = formatLedgerEntry(repo.findLedgerEntryById(ledgerId));
    const updatedCustomer = getCustomerById(cleanCustomerId);

    return {
      customer: updatedCustomer,
      ledgerEntry,
      previousBalanceSat: currentBalanceSat,
      balanceSat: newBalanceSat,
      balance_sat: newBalanceSat,
    };
  });

  return runDepositTx();
}

/**
 * 2) รายงานค้างชำระ (FIN-2) — GET /api/billing/unpaid?zone&aging&customerId&page&limit
 */
export function listUnpaidBilling(query = {}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.max(1, Number(query.limit ?? 50));
  const zone = String(query.zone ?? '').trim();
  const aging = String(query.aging ?? '').trim();
  const search = String(query.search ?? '').trim();
  const customerId = query.customerId !== undefined ? Number(query.customerId) : undefined;

  const { rows, total, allMatchingRows } = repo.listUnpaidOrders({
    zone,
    aging,
    customerId,
    search,
    page,
    limit,
  });

  const formattedOrders = rows.map(formatUnpaidOrderRow);

  // สรุปยอดหนี้ต่อลูกค้า: ยอดหนี้ต่อลูกค้า = ยอดออเดอร์ค้าง − เงินที่เก็บแล้ว − deposit คงเหลือ (FIN-2)
  const customerMap = new Map();
  let count30Plus = 0;
  let count60Plus = 0;
  let count90Plus = 0;

  for (const row of allMatchingRows) {
    const ageDays = Math.max(0, Math.trunc(Number(row.age_days ?? 0)));
    if (ageDays >= 30) count30Plus += 1;
    if (ageDays >= 60) count60Plus += 1;
    if (ageDays >= 90) count90Plus += 1;

    const cid = Number(row.customer_id);
    if (!customerMap.has(cid)) {
      customerMap.set(cid, {
        customerId: cid,
        customerCode: row.customer_code ?? null,
        customerName: row.customer_name ?? null,
        customerPhone: row.customer_phone ?? null,
        zone: row.customer_zone ?? null,
        depositBalanceSat: Math.max(0, Number(row.customer_balance_sat ?? 0)),
        outstandingBottles: Math.max(0, Number(row.customer_outstanding_bottles ?? 0)),
        totalOrderSat: 0,
        paidOrderSat: 0,
        unpaidOrderCount: 0,
        maxAgeDays: 0,
      });
    }

    const entry = customerMap.get(cid);
    entry.totalOrderSat += Math.max(0, Number(row.total_sat ?? 0));
    entry.paidOrderSat += Math.max(0, Number(row.paid_sat ?? 0));
    entry.unpaidOrderCount += 1;
    if (ageDays > entry.maxAgeDays) entry.maxAgeDays = ageDays;
  }

  const customerSummaries = Array.from(customerMap.values()).map((c) => {
    const debt = calculateCustomerNetDebt({
      totalOrderSat: c.totalOrderSat,
      paidOrderSat: c.paidOrderSat,
      depositBalanceSat: c.depositBalanceSat,
    });
    return {
      ...c,
      grossUnpaidSat: debt.grossUnpaidSat,
      grossUnpaidBaht: satangToBaht(debt.grossUnpaidSat),
      depositBalanceBaht: satangToBaht(debt.depositBalanceSat),
      netDebtSat: debt.netDebtSat,
      netDebtBaht: satangToBaht(debt.netDebtSat),
      agingBucket: deriveAgingBucket(c.maxAgeDays),
    };
  });

  const totalGrossUnpaidSat = customerSummaries.reduce(
    (sum, c) => sum + c.grossUnpaidSat,
    0,
  );
  const totalDepositAvailableSat = customerSummaries.reduce(
    (sum, c) => sum + c.depositBalanceSat,
    0,
  );
  const totalNetDebtSat = customerSummaries.reduce((sum, c) => sum + c.netDebtSat, 0);

  return {
    data: formattedOrders,
    items: formattedOrders,
    orders: formattedOrders,
    customers: customerSummaries,
    customerSummaries,
    summary: {
      totalUnpaidOrders: total,
      totalCustomersWithDebt: customerSummaries.length,
      totalGrossUnpaidSat,
      totalGrossUnpaidBaht: satangToBaht(totalGrossUnpaidSat),
      totalDepositAvailableSat,
      totalNetDebtSat,
      totalNetDebtBaht: satangToBaht(totalNetDebtSat),
      count30Plus,
      count60Plus,
      count90Plus,
    },
    meta: computePaginationMeta(page, limit, total),
    pagination: computePaginationMeta(page, limit, total),
  };
}

/**
 * 3) ปิดยอดแบบ FIFO (FIN-3) — POST /api/billing/settle
 * { customerId, amountSat, method, useDepositSat, note }
 */
export function settleCustomerDebt(payload, actorId = null) {
  const customerId = Number(payload.customerId ?? payload.customer_id);
  const amountSat = Math.trunc(
    Number(payload.amountSat ?? payload.amount_sat ?? 0),
  );
  const useDepositSat = Math.trunc(
    Number(payload.useDepositSat ?? payload.use_deposit_sat ?? 0),
  );
  const rawMethod = payload.method ?? 'cash';
  const note = String(payload.note ?? '').trim();

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw AppError.badRequest('กรุณาระบุรหัสลูกค้า (customerId) ที่ถูกต้อง');
  }

  const db = getDb();

  const runSettleTx = db.transaction(() => {
    const customer = customersRepo.findCustomerById(customerId, {
      includeInactive: true,
    });
    if (!customer) {
      throw AppError.notFound('ไม่พบข้อมูลลูกค้า');
    }

    const currentDepositSat = Math.max(0, Number(customer.balance_sat ?? 0));
    const unpaidOrders = repo.listCustomerUnpaidOrdersFifo(customerId);

    const plan = calculateFifoSettlement({
      orders: unpaidOrders,
      currentDepositSat,
      amountSat,
      useDepositSat,
    });

    // อัปเดต orders.paid_sat ตามแผน FIFO
    for (const settled of plan.settledOrders) {
      repo.updateOrderPaidSat(settled.id, settled.paidSat);
    }

    // อัปเดต customers.balance_sat (กรณีหักใช้ deposit หรือมีเงินทอน/ส่วนเกินเข้า deposit)
    if (plan.useDepositSat > 0 || plan.excessToDepositSat > 0) {
      repo.updateCustomerBalanceSat(customerId, plan.newDepositBalanceSat);
    }

    // สร้างใบเสร็จรับเงิน 1 ใบใน payment_receipts
    const todayIso = new Date().toISOString().slice(0, 10);
    const prefix = buildReceiptCodePrefix(todayIso);
    const nextSeq = deliveryRepo.getMaxReceiptCodeSeqForPrefix(prefix) + 1;
    const receiptCode = formatReceiptCode(todayIso, nextSeq);

    const effectiveMethod =
      plan.amountSat === 0 && plan.useDepositSat > 0 ? 'deposit' : rawMethod;
    const receiptAmountSat =
      plan.amountSat > 0 ? plan.amountSat : plan.useDepositSat;
    const linkedOrderId =
      plan.settledOrders.length === 1 ? plan.settledOrders[0].id : null;

    const receiptId = deliveryRepo.insertPaymentReceipt({
      code: receiptCode,
      customerId,
      orderId: linkedOrderId,
      checkinId: null,
      amountSat: receiptAmountSat,
      method: effectiveMethod,
      createdBy: actorId,
    });

    // บันทึก customer_ledger:
    // 1. ถ้าใช้ deposit -> deposit_use
    if (plan.useDepositSat > 0) {
      repo.insertLedgerEntry({
        customerId,
        entryType: 'deposit_use',
        amountSat: plan.useDepositSat,
        refType: 'receipt',
        refId: receiptCode,
        note: note || `ใช้เงินมัดจำปิดบิล (${receiptCode})`,
        createdBy: actorId,
      });
    }

    // 2. ถ้ามีการจ่ายเงิน -> payment
    if (plan.amountSat > 0) {
      repo.insertLedgerEntry({
        customerId,
        entryType: 'payment',
        amountSat: plan.amountSat,
        refType: 'receipt',
        refId: receiptCode,
        note: note || `ชำระหนี้ค้างแบบ FIFO (${receiptCode})`,
        createdBy: actorId,
      });
    }

    // 3. ถ้ายอดชำระเกินหนี้ทั้งหมด -> ส่วนเกินเข้า deposit (deposit_in)
    if (plan.excessToDepositSat > 0) {
      repo.insertLedgerEntry({
        customerId,
        entryType: 'deposit_in',
        amountSat: plan.excessToDepositSat,
        refType: 'receipt',
        refId: receiptCode,
        note: `ยอดชำระเกินหนี้คงค้าง เก็บเข้าเงินมัดจำ (${receiptCode})`,
        createdBy: actorId,
      });
    }

    const receiptRow = deliveryRepo.findReceiptById(receiptId);
    const receipt = formatReceipt(receiptRow);

    // คำนวณยอดค้างคงเหลือหลังปิดบิล
    const remainingOrders = repo.listCustomerUnpaidOrdersFifo(customerId);
    const remainingOrderTotalSat = remainingOrders.reduce(
      (s, o) => s + Math.max(0, Number(o.total_sat ?? 0)),
      0,
    );
    const remainingOrderPaidSat = remainingOrders.reduce(
      (s, o) => s + Math.max(0, Number(o.paid_sat ?? 0)),
      0,
    );
    const remainingDebt = calculateCustomerNetDebt({
      totalOrderSat: remainingOrderTotalSat,
      paidOrderSat: remainingOrderPaidSat,
      depositBalanceSat: plan.newDepositBalanceSat,
    });

    return {
      receipt,
      settledOrders: plan.settledOrders,
      excessToDepositSat: plan.excessToDepositSat,
      customerBalance: {
        customerId,
        customerCode: customer.code,
        customerName: customer.name,
        previousDepositSat: plan.previousDepositSat,
        usedDepositSat: plan.useDepositSat,
        excessToDepositSat: plan.excessToDepositSat,
        balanceSat: plan.newDepositBalanceSat,
        balance_sat: plan.newDepositBalanceSat,
        remainingGrossUnpaidSat: remainingDebt.grossUnpaidSat,
        remainingNetDebtSat: remainingDebt.netDebtSat,
      },
    };
  });

  return runSettleTx();
}

/**
 * 4.1) สลิปใบเสร็จ (FIN-4) — GET /api/billing/slip/:receiptId
 */
export function getReceiptSlip(receiptId) {
  const row = repo.findReceiptDetailById(receiptId);
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลใบเสร็จรับเงิน');
  }

  const receipt = formatReceipt(row);
  const ledgerRows = repo.listLedgerEntriesByReceiptCode(row.code);
  const ledgerEntries = ledgerRows.map(formatLedgerEntry);

  const unpaidOrders = repo
    .listCustomerUnpaidOrdersFifo(row.customer_id)
    .map(formatUnpaidOrderRow);
  const remainingTotalSat = unpaidOrders.reduce((s, o) => s + o.totalSat, 0);
  const remainingPaidSat = unpaidOrders.reduce((s, o) => s + o.paidSat, 0);
  const debtSummary = calculateCustomerNetDebt({
    totalOrderSat: remainingTotalSat,
    paidOrderSat: remainingPaidSat,
    depositBalanceSat: row.customer_balance_sat,
  });

  const usedDepositSat = ledgerEntries
    .filter((l) => l.entryType === 'deposit_use')
    .reduce((s, l) => s + l.amountSat, 0);
  const excessDepositInSat = ledgerEntries
    .filter((l) => l.entryType === 'deposit_in')
    .reduce((s, l) => s + l.amountSat, 0);

  const slip = {
    slipNo: receipt.code,
    printedAt: new Date().toISOString(),
    company: {
      name: 'น้ำดื่มอินทรา (Inthara Smart Water)',
      subtitle: 'ใบเสร็จรับเงิน / ใบสำคัญรับชำระหนี้',
    },
    receipt,
    customer: {
      id: row.customer_id,
      code: row.customer_code,
      name: row.customer_name,
      phone: row.customer_phone,
      address: row.customer_address,
      zone: row.customer_zone,
      balanceSat: Math.max(0, Number(row.customer_balance_sat ?? 0)),
      outstandingBottles: Math.max(0, Number(row.customer_outstanding_bottles ?? 0)),
    },
    ledgerEntries,
    summary: {
      receiptAmountSat: receipt.amountSat,
      receiptAmountBaht: receipt.amountBaht,
      usedDepositSat,
      usedDepositBaht: satangToBaht(usedDepositSat),
      excessDepositInSat,
      excessDepositInBaht: satangToBaht(excessDepositInSat),
      method: receipt.method,
      remainingGrossUnpaidSat: debtSummary.grossUnpaidSat,
      remainingGrossUnpaidBaht: satangToBaht(debtSummary.grossUnpaidSat),
      depositBalanceAfterSat: debtSummary.depositBalanceSat,
      depositBalanceAfterBaht: satangToBaht(debtSummary.depositBalanceSat),
      remainingNetDebtSat: debtSummary.netDebtSat,
      remainingNetDebtBaht: satangToBaht(debtSummary.netDebtSat),
    },
  };

  return {
    ...slip,
    data: slip,
    slip,
  };
}

/**
 * 4.2) สลิปสรุปประวัติค้างชำระของลูกค้า (FIN-4) — GET /api/billing/history-slip/:customerId
 */
export function getCustomerHistorySlip(customerId) {
  const customer = customersRepo.findCustomerById(Number(customerId), {
    includeInactive: true,
  });
  if (!customer) {
    throw AppError.notFound('ไม่พบข้อมูลลูกค้า');
  }

  const unpaidOrders = repo
    .listCustomerUnpaidOrdersFifo(customer.id)
    .map(formatUnpaidOrderRow);
  const recentReceipts = repo
    .listRecentReceiptsByCustomer(customer.id, 20)
    .map(formatReceipt);
  const recentLedger = repo
    .listRecentLedgerByCustomer(customer.id, 30)
    .map(formatLedgerEntry);

  const totalOrderSat = unpaidOrders.reduce((s, o) => s + o.totalSat, 0);
  const paidOrderSat = unpaidOrders.reduce((s, o) => s + o.paidSat, 0);
  const debtSummary = calculateCustomerNetDebt({
    totalOrderSat,
    paidOrderSat,
    depositBalanceSat: customer.balance_sat,
  });

  const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const slipNo = `HSL-${yymmdd}-${customer.code}`;

  const historySlip = {
    slipNo,
    printedAt: new Date().toISOString(),
    company: {
      name: 'น้ำดื่มอินทรา (Inthara Smart Water)',
      subtitle: 'ใบแจ้งยอดค้างชำระและประวัติการชำระเงิน (Customer Billing Statement)',
    },
    customer: {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone ?? null,
      address: customer.address ?? null,
      zone: customer.zone ?? null,
      balanceSat: Math.max(0, Number(customer.balance_sat ?? 0)),
      balanceBaht: satangToBaht(Math.max(0, Number(customer.balance_sat ?? 0))),
      outstandingBottles: Math.max(0, Number(customer.outstanding_bottles ?? 0)),
    },
    unpaidOrders,
    recentReceipts,
    recentLedger,
    summary: {
      unpaidOrderCount: unpaidOrders.length,
      totalOrderSat: debtSummary.totalOrderSat,
      totalOrderBaht: satangToBaht(debtSummary.totalOrderSat),
      paidOrderSat: debtSummary.paidOrderSat,
      paidOrderBaht: satangToBaht(debtSummary.paidOrderSat),
      grossUnpaidSat: debtSummary.grossUnpaidSat,
      grossUnpaidBaht: satangToBaht(debtSummary.grossUnpaidSat),
      depositBalanceSat: debtSummary.depositBalanceSat,
      depositBalanceBaht: satangToBaht(debtSummary.depositBalanceSat),
      netDebtSat: debtSummary.netDebtSat,
      netDebtBaht: satangToBaht(debtSummary.netDebtSat),
      outstandingBottles: Math.max(0, Number(customer.outstanding_bottles ?? 0)),
    },
  };

  return {
    ...historySlip,
    data: historySlip,
    slip: historySlip,
  };
}
