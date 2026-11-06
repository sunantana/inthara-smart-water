import { getDb } from '../../db/connection.js';
import { AppError } from '../../utils/errors.js';
import { satangToBaht } from '../../utils/money.js';
import * as customersRepo from '../customers/repo.js';
import {
  computePaginationMeta,
  resolveCustomerEffectivePrices,
} from '../customers/service.js';
import * as inventoryRepo from '../inventory/repo.js';
import * as ordersRepo from '../orders/repo.js';
import { ORDER_SKUS } from '../orders/schema.js';
import { getOrderById } from '../orders/service.js';
import * as repo from './repo.js';

export const SKU_LABELS = {
  'FG-189L': 'น้ำดื่มถัง 18.9 ลิตร',
  'FG-350ML': 'น้ำดื่ม 350 มล. (แพ็ค 12)',
  'FG-600ML': 'น้ำดื่ม 600 มล. (แพ็ค 12)',
  'FG-1500ML': 'น้ำดื่ม 1500 มล. (แพ็ค 6)',
};

export function buildReceiptCodePrefix(dateStr) {
  const clean = String(dateStr || '').trim();
  const yymmdd = /^\d{4}-\d{2}-\d{2}$/.test(clean)
    ? clean.slice(2).replace(/-/g, '')
    : new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `RCP-${yymmdd}-`;
}

export function formatReceiptCode(dateStr, seq) {
  const prefix = buildReceiptCodePrefix(dateStr);
  const num = Math.max(1, Number(seq) || 1);
  return `${prefix}${String(num).padStart(3, '0')}`;
}

export function normalizeDeliveredInput(rawDelivered) {
  const map = {};

  if (Array.isArray(rawDelivered)) {
    for (const entry of rawDelivered) {
      if (!entry || !entry.sku) continue;
      const sku = String(entry.sku).trim();
      const qty = Math.trunc(Number(entry.qty ?? 0));
      if (!Number.isFinite(qty) || qty < 0) {
        throw AppError.badRequest(`จำนวนสินค้าที่ส่งของ ${sku} ต้องไม่ติดลบ`, [
          { field: `delivered.${sku}`, issue: 'จำนวนส่งต้องไม่ติดลบ' },
        ]);
      }
      map[sku] = (map[sku] ?? 0) + qty;
    }
    return map;
  }

  if (rawDelivered && typeof rawDelivered === 'object') {
    for (const [rawSku, rawQty] of Object.entries(rawDelivered)) {
      const sku = String(rawSku).trim();
      if (!sku) continue;
      const qty = Math.trunc(Number(rawQty ?? 0));
      if (!Number.isFinite(qty) || qty < 0) {
        throw AppError.badRequest(`จำนวนสินค้าที่ส่งของ ${sku} ต้องไม่ติดลบ`, [
          { field: `delivered.${sku}`, issue: 'จำนวนส่งต้องไม่ติดลบ' },
        ]);
      }
      map[sku] = qty;
    }
  }

  return map;
}

export function formatReceipt(row) {
  if (!row) return null;
  const amountSat = Number(row.amount_sat ?? 0);
  return {
    id: row.id,
    code: row.code,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    orderId: row.order_id,
    order_id: row.order_id,
    checkinId: row.checkin_id,
    checkin_id: row.checkin_id,
    amountSat,
    amount_sat: amountSat,
    amountBaht: satangToBaht(amountSat),
    method: row.method,
    printed: Boolean(row.printed),
    createdBy: row.created_by ?? null,
    created_by: row.created_by ?? null,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

export function formatCheckin(row) {
  if (!row) return null;
  let delivered = {};
  try {
    delivered = row.delivered_json ? JSON.parse(row.delivered_json) : {};
  } catch {
    delivered = {};
  }

  const returned189L = Number(row.returned_189l ?? 0);
  const moneyReceivedSat = Number(row.money_received_sat ?? 0);
  const orderTotalSat = Number(row.order_total_sat ?? 0);
  const unpaidDebtSat = Math.max(0, orderTotalSat - moneyReceivedSat);

  return {
    id: row.id,
    orderId: row.order_id,
    order_id: row.order_id,
    orderCode: row.order_code ?? null,
    order_code: row.order_code ?? null,
    deliveryDate: row.order_delivery_date ?? null,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    customerCode: row.customer_code ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    customerAddress: row.customer_address ?? null,
    customerRoute: row.customer_route ?? null,
    customerOutstandingBottles: Number(row.customer_outstanding_bottles ?? 0),
    tripId: row.trip_id ?? null,
    trip_id: row.trip_id ?? null,
    delivered,
    delivered_json: row.delivered_json,
    returned189L,
    returned_189l: returned189L,
    paymentMode: row.payment_mode,
    payment_mode: row.payment_mode,
    moneyReceivedSat,
    money_received_sat: moneyReceivedSat,
    moneyReceivedBaht: satangToBaht(moneyReceivedSat),
    orderTotalSat,
    orderTotalBaht: satangToBaht(orderTotalSat),
    unpaidDebtSat,
    unpaidDebtBaht: satangToBaht(unpaidDebtSat),
    notes: row.notes ?? '',
    performedBy: row.performed_by ?? null,
    performed_by: row.performed_by ?? null,
    performedByName: row.performed_by_name ?? row.performed_by_username ?? null,
    receiptId: row.receipt_id ?? null,
    receiptCode: row.receipt_code ?? null,
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}

/**
 * เช็คอินส่งน้ำถึงลูกค้า (DLV-1..DLV-4)
 * ทำงานทั้ง 5 ขั้นตอนใน db.transaction() เดียว (Atomic 100%)
 */
export function createCheckin(payload, actorId = null) {
  const orderId = Number(payload.orderId ?? payload.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw AppError.badRequest('รหัสออเดอร์ (orderId) ไม่ถูกต้อง', [
      { field: 'orderId', issue: 'กรุณาระบุ orderId ที่ถูกต้อง' },
    ]);
  }

  const returned189L = Math.trunc(
    Number(payload.returned189L ?? payload.returned_189l ?? 0),
  );
  if (!Number.isFinite(returned189L) || returned189L < 0) {
    throw AppError.badRequest('จำนวนถังเปล่าที่รับคืนต้องไม่ติดลบ', [
      { field: 'returned189L', issue: 'ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' },
    ]);
  }

  const paymentMode = payload.paymentMode ?? payload.payment_mode ?? 'cash';
  if (paymentMode !== 'cash' && paymentMode !== 'credit') {
    throw AppError.badRequest('รูปแบบการชำระเงินต้องเป็น cash หรือ credit');
  }

  const rawMoneyReceived =
    payload.moneyReceivedSat !== undefined
      ? payload.moneyReceivedSat
      : payload.money_received_sat;
  if (rawMoneyReceived !== undefined && rawMoneyReceived !== null) {
    const parsedMoney = Number(rawMoneyReceived);
    if (!Number.isInteger(parsedMoney) || parsedMoney < 0) {
      throw AppError.badRequest('จำนวนเงินที่รับ (สตางค์) ต้องเป็นจำนวนเต็มไม่ติดลบ', [
        { field: 'moneyReceivedSat', issue: 'ต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 0 ขึ้นไป' },
      ]);
    }
  }

  const deliveredInputMap = normalizeDeliveredInput(payload.delivered);
  const notes = String(payload.notes ?? '').trim();

  const db = getDb();

  const executeAtomicCheckin = db.transaction(() => {
    const order = ordersRepo.findOrderById(orderId);
    if (!order) {
      throw AppError.notFound('ไม่พบข้อมูลออเดอร์');
    }

    if (order.status === 'delivered' || repo.findCheckinByOrderId(order.id)) {
      throw AppError.conflict(
        'ออเดอร์นี้ถูกส่งและเช็คอินเรียบร้อยแล้ว ไม่สามารถเช็คอินซ้ำได้',
      );
    }

    if (order.status === 'cancelled') {
      throw AppError.conflict('ไม่สามารถเช็คอินออเดอร์ที่ถูกยกเลิกแล้ว');
    }

    const customer = customersRepo.findCustomerById(order.customer_id, {
      includeInactive: true,
    });
    if (!customer) {
      throw AppError.notFound('ไม่พบข้อมูลลูกค้าของออเดอร์นี้');
    }

    if (
      payload.customerId !== undefined &&
      payload.customerId !== null &&
      Number(payload.customerId) !== Number(order.customer_id)
    ) {
      throw AppError.badRequest('รหัสลูกค้าไม่ตรงกับออเดอร์ที่ระบุ');
    }

    const customerPrices = resolveCustomerEffectivePrices(customer);
    const orderItems = ordersRepo.getOrderItemsByOrderId(order.id);
    const existingItemsBySku = new Map(
      (orderItems ?? []).map((item) => [item.sku, item]),
    );

    const allSkus = new Set([
      ...ORDER_SKUS,
      ...existingItemsBySku.keys(),
      ...Object.keys(deliveredInputMap),
    ]);

    const normalizedDelivered = {
      'FG-189L': 0,
      'FG-350ML': 0,
      'FG-600ML': 0,
      'FG-1500ML': 0,
    };

    let newOrderTotalSat = 0;

    // (1) อัปเดต order_items และ orders (status = 'delivered', completed_at = now, ยอดรวมจริงตามของส่งจริง)
    for (const sku of allSkus) {
      const deliveredQty = Math.max(0, Math.trunc(Number(deliveredInputMap[sku] ?? 0)));
      normalizedDelivered[sku] = deliveredQty;
      const returnedQty = sku === 'FG-189L' ? returned189L : 0;

      const existingItem = existingItemsBySku.get(sku);
      const unitPriceSat = existingItem
        ? Number(existingItem.unit_price_sat ?? 0)
        : Number(customerPrices[sku] ?? 0);

      newOrderTotalSat += deliveredQty * unitPriceSat;

      if (existingItem) {
        repo.updateOrderItemDelivered({
          itemId: existingItem.id,
          deliveredQty,
          returnedQty,
        });
      } else if (ORDER_SKUS.includes(sku) && (deliveredQty > 0 || returnedQty > 0)) {
        repo.insertExtraOrderItemOnCheckin({
          orderId: order.id,
          sku,
          qty: 0,
          unitPriceSat,
          deliveredQty,
          returnedQty,
        });
      }
    }

    const effectiveMoneyReceivedSat =
      paymentMode === 'cash'
        ? rawMoneyReceived !== undefined &&
          rawMoneyReceived !== null &&
          Number(rawMoneyReceived) > 0
          ? Math.trunc(Number(rawMoneyReceived))
          : newOrderTotalSat
        : rawMoneyReceived !== undefined && rawMoneyReceived !== null
          ? Math.max(0, Math.trunc(Number(rawMoneyReceived)))
          : 0;

    repo.updateOrderDelivered({
      orderId: order.id,
      totalSat: newOrderTotalSat,
      paidSat: effectiveMoneyReceivedSat,
      paymentMode,
    });

    // (2) ตรวจสอบและตัดสต็อก FG ทุก SKU ที่ส่ง + เพิ่มสต็อก RET-189L-EMPTY ตามถังที่รับคืน
    // หาก SKU ไม่มีใน inventory_items หรือ stock < deliveredQty -> throw AppError.badRequest เพื่อ rollback ทั้งหมด
    for (const explicitSku of Object.keys(deliveredInputMap)) {
      const invItem = inventoryRepo.findInventoryItemBySku(explicitSku);
      if (!invItem) {
        throw AppError.badRequest(
          `ไม่พบรหัสสินค้า ${explicitSku} ในคลังสินค้า (inventory_items)`,
          [{ field: 'delivered', sku: explicitSku, issue: `ไม่พบรหัสสินค้า ${explicitSku} ในคลังสินค้า` }],
        );
      }
    }

    for (const [sku, rawQty] of Object.entries(normalizedDelivered)) {
      const deliveredQty = Math.trunc(Number(rawQty ?? 0));
      if (deliveredQty <= 0) continue;

      const invItem = inventoryRepo.findInventoryItemBySku(sku);
      if (!invItem) {
        throw AppError.badRequest(
          `ไม่พบรหัสสินค้า ${sku} ในคลังสินค้า (inventory_items)`,
          [{ field: 'delivered', sku, issue: `ไม่พบรหัสสินค้า ${sku} ในคลังสินค้า` }],
        );
      }

      const currentStock = Number(invItem.stock ?? 0);
      if (currentStock < deliveredQty) {
        throw AppError.badRequest(
          `สต็อกสินค้า ${sku} ไม่เพียงพอ (คงเหลือ ${currentStock} ต้องการส่ง ${deliveredQty})`,
          [
            {
              field: 'delivered',
              sku,
              available: currentStock,
              requested: deliveredQty,
              issue: `สต็อก ${sku} ไม่พอ`,
            },
          ],
        );
      }

      inventoryRepo.changeInventoryStockByDelta(sku, -deliveredQty);
    }

    if (returned189L > 0) {
      const emptyBottleItem = inventoryRepo.findInventoryItemBySku('RET-189L-EMPTY');
      if (!emptyBottleItem) {
        throw AppError.badRequest(
          'ไม่พบรหัสถังเปล่า RET-189L-EMPTY ในคลังสินค้า (inventory_items)',
          [
            {
              field: 'returned189L',
              sku: 'RET-189L-EMPTY',
              issue: 'ไม่พบรหัสสินค้า RET-189L-EMPTY ในคลังสินค้า',
            },
          ],
        );
      }
      inventoryRepo.changeInventoryStockByDelta('RET-189L-EMPTY', +returned189L);
    }

    // (3) อัปเดต customers.outstanding_bottles = max(0, เดิม + ส่ง18.9L − คืน18.9L)
    const delivered189L = Math.max(0, Math.trunc(Number(normalizedDelivered['FG-189L'] ?? 0)));
    const previousBottles = Number(customer.outstanding_bottles ?? 0);
    const newOutstandingBottles = Math.max(
      0,
      previousBottles + delivered189L - returned189L,
    );
    repo.updateCustomerOutstandingBottles(customer.id, newOutstandingBottles);

    // (4) บันทึก checkins และ stock_movements (reason = 'order_out' และ 'checkin_return')
    const checkinId = repo.insertCheckin({
      orderId: order.id,
      customerId: customer.id,
      tripId: payload.tripId ?? payload.trip_id ?? order.trip_id ?? null,
      deliveredJson: JSON.stringify(normalizedDelivered),
      returned189L,
      paymentMode,
      moneyReceivedSat: effectiveMoneyReceivedSat,
      notes,
      performedBy: actorId,
    });

    for (const [sku, rawQty] of Object.entries(normalizedDelivered)) {
      const deliveredQty = Math.trunc(Number(rawQty ?? 0));
      if (deliveredQty > 0) {
        inventoryRepo.insertStockMovement({
          sku,
          qtyChange: -deliveredQty,
          reason: 'order_out',
          refType: 'checkin',
          refId: String(checkinId),
          performedBy: actorId,
        });
      }
    }

    if (returned189L > 0) {
      inventoryRepo.insertStockMovement({
        sku: 'RET-189L-EMPTY',
        qtyChange: +returned189L,
        reason: 'checkin_return',
        refType: 'checkin',
        refId: String(checkinId),
        performedBy: actorId,
      });
    }

    // (5) บันทึก payment_receipts + customer_ledger
    let receiptRow = null;
    if (paymentMode === 'cash' || effectiveMoneyReceivedSat > 0) {
      const prefix = buildReceiptCodePrefix(order.delivery_date);
      const nextSeq = repo.getMaxReceiptCodeSeqForPrefix(prefix) + 1;
      const receiptCode = formatReceiptCode(order.delivery_date, nextSeq);

      const receiptId = repo.insertPaymentReceipt({
        code: receiptCode,
        customerId: customer.id,
        orderId: order.id,
        checkinId,
        amountSat: effectiveMoneyReceivedSat,
        method: 'cash',
        createdBy: actorId,
      });

      receiptRow = repo.findReceiptById(receiptId);

      repo.insertCustomerLedgerEntry({
        customerId: customer.id,
        entryType: 'payment',
        amountSat: effectiveMoneyReceivedSat,
        refType: 'receipt',
        refId: receiptCode,
        note: `รับชำระเงินสดจากการส่งน้ำ (${order.code})`,
        createdBy: actorId,
      });
    }

    const unpaidDebtSat = Math.max(0, newOrderTotalSat - effectiveMoneyReceivedSat);
    if (paymentMode === 'credit' || unpaidDebtSat > 0) {
      if (unpaidDebtSat > 0) {
        repo.insertCustomerLedgerEntry({
          customerId: customer.id,
          entryType: 'order_debt',
          amountSat: unpaidDebtSat,
          refType: 'order',
          refId: order.code,
          note: `ค้างชำระค่าส่งน้ำ (${order.code})`,
          createdBy: actorId,
        });
      }
    }

    const updatedOrder = getOrderById(order.id);
    const checkin = formatCheckin(repo.findCheckinById(checkinId));
    const receipt = formatReceipt(receiptRow);
    const ledgerSums = repo.getCustomerFinancialSummary(customer.id);

    const customerBalance = {
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      previousOutstandingBottles: previousBottles,
      outstandingBottles: newOutstandingBottles,
      outstanding_bottles: newOutstandingBottles,
      unpaidOrderDebtSat: unpaidDebtSat,
      totalOrderDebtSat: ledgerSums.order_debt,
      totalPaymentSat: ledgerSums.payment,
    };

    return {
      checkin,
      order: updatedOrder,
      receipt,
      customerBalance,
    };
  });

  return executeAtomicCheckin();
}

export function listCheckins(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);

  const { rows, total } = repo.listCheckins({
    date: (query.date ?? '').trim(),
    dateFrom: (query.dateFrom ?? '').trim(),
    dateTo: (query.dateTo ?? '').trim(),
    driverId: query.driverId,
    customerId: query.customerId,
    orderId: query.orderId,
    paymentMode: (query.paymentMode ?? '').trim(),
    page,
    limit,
  });

  const formatted = rows.map(formatCheckin);
  return {
    data: formatted,
    items: formatted,
    checkins: formatted,
    meta: computePaginationMeta(page, limit, total),
  };
}

export function getCheckinSlip(checkinId) {
  const checkinRow = repo.findCheckinById(checkinId);
  if (!checkinRow) {
    throw AppError.notFound('ไม่พบข้อมูลใบเช็คอิน');
  }

  const checkin = formatCheckin(checkinRow);
  const order = getOrderById(checkin.orderId);
  const receiptRow = repo.findReceiptByCheckinId(checkin.id);
  const receipt = formatReceipt(receiptRow);

  const slipItems = (order?.items ?? []).map((item) => ({
    sku: item.sku,
    name: SKU_LABELS[item.sku] ?? item.sku,
    plannedQty: item.qty,
    deliveredQty: item.deliveredQty,
    returnedQty: item.returnedQty,
    unitPriceSat: item.unitPriceSat,
    unitPriceBaht: satangToBaht(item.unitPriceSat),
    lineTotalSat: item.deliveredQty * item.unitPriceSat,
    lineTotalBaht: satangToBaht(item.deliveredQty * item.unitPriceSat),
  }));

  const slipNo =
    receipt?.code ??
    `SLP-${String(checkin.createdAt || '').slice(2, 10).replace(/-/g, '')}-${String(checkin.id).padStart(3, '0')}`;

  const slip = {
    slipNo,
    printedAt: new Date().toISOString(),
    company: {
      name: 'น้ำดื่มอินทรา (Inthara Smart Water)',
      subtitle: 'ใบส่งสินค้า / ใบรับถังเปล่า / ใบเสร็จรับเงิน',
    },
    checkin,
    order,
    receipt,
    customer: {
      id: checkin.customerId,
      code: checkin.customerCode,
      name: checkin.customerName,
      phone: checkin.customerPhone,
      address: checkin.customerAddress,
      route: checkin.customerRoute,
      outstandingBottles: checkin.customerOutstandingBottles,
    },
    items: slipItems,
    summary: {
      totalSat: checkin.orderTotalSat,
      totalBaht: checkin.orderTotalBaht,
      moneyReceivedSat: checkin.moneyReceivedSat,
      moneyReceivedBaht: checkin.moneyReceivedBaht,
      unpaidDebtSat: checkin.unpaidDebtSat,
      unpaidDebtBaht: checkin.unpaidDebtBaht,
      paymentMode: checkin.paymentMode,
      delivered189L: Number(checkin.delivered?.['FG-189L'] ?? 0),
      returned189L: checkin.returned189L,
      outstandingBottlesAfter: checkin.customerOutstandingBottles,
    },
  };

  return {
    ...slip,
    data: slip,
    slip,
  };
}
