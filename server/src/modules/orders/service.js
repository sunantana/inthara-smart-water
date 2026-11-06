import ExcelJS from 'exceljs';
import { AppError } from '../../utils/errors.js';
import { satangToBaht } from '../../utils/money.js';
import * as customersRepo from '../customers/repo.js';
import {
  computePaginationMeta,
  resolveCustomerEffectivePrices,
} from '../customers/service.js';
import * as repo from './repo.js';
import { ORDER_SKUS } from './schema.js';

export const DUPLICATE_WINDOW_MS = 4_000;

/**
 * เก็บลายเซ็นออเดอร์ล่าสุดในหน่วยความจำเพื่อรองรับการกันกดส่งซ้ำภายใน 4 วินาทีอย่างแม่นยำระดับ millisecond (ORD-3)
 * ควบคู่กับการตรวจจากฐานข้อมูล
 * @type {Map<string, { orderId: number, timestampMs: number }>}
 */
const recentOrderFingerprints = new Map();

export function resetOrderDuplicateWindow() {
  recentOrderFingerprints.clear();
}

export function buildOrderCodePrefix(deliveryDate) {
  const clean = String(deliveryDate || '').trim();
  const yymmdd = /^\d{4}-\d{2}-\d{2}$/.test(clean)
    ? clean.slice(2).replace(/-/g, '')
    : new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `ORD-${yymmdd}-`;
}

export function formatOrderCode(deliveryDate, seq) {
  const prefix = buildOrderCodePrefix(deliveryDate);
  const num = Math.max(1, Number(seq) || 1);
  return `${prefix}${String(num).padStart(3, '0')}`;
}

export function derivePaymentStatus(totalSat, paidSat) {
  const total = Number(totalSat ?? 0);
  const paid = Number(paidSat ?? 0);
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0 && paid < total) return 'partial';
  return 'unpaid';
}

/**
 * รวมจำนวนสินค้าตาม SKU ทั้ง 4 ขนาด และคำนวณราคารวมจากราคาในทะเบียนลูกค้าเท่านั้น (ห้ามใช้ราคาจาก body)
 */
export function buildOrderItemsAndTotal(rawItems, customerPrices) {
  const qtyBySku = {
    'FG-189L': 0,
    'FG-350ML': 0,
    'FG-600ML': 0,
    'FG-1500ML': 0,
  };

  for (const item of rawItems ?? []) {
    if (!item || !ORDER_SKUS.includes(item.sku)) continue;
    const qty = Math.max(0, Math.trunc(Number(item.qty) || 0));
    qtyBySku[item.sku] += qty;
  }

  const totalQty = Object.values(qtyBySku).reduce((sum, q) => sum + q, 0);
  if (totalQty <= 0) {
    throw AppError.badRequest(
      'ไม่สามารถบันทึกออเดอร์ได้: จำนวนสินค้าทั้งหมดรวมกันต้องมากกว่า 0',
      [{ field: 'body.items', issue: 'จำนวนสินค้าทั้งหมดต้องมากกว่า 0' }],
    );
  }

  const normalizedItems = [];
  let totalSat = 0;

  for (const sku of ORDER_SKUS) {
    const qty = qtyBySku[sku];
    const unitPriceSat = Number(customerPrices[sku] ?? 0);
    if (qty > 0) {
      const lineTotalSat = qty * unitPriceSat;
      totalSat += lineTotalSat;
      normalizedItems.push({
        sku,
        qty,
        unitPriceSat,
        lineTotalSat,
      });
    }
  }

  return {
    items: normalizedItems,
    qtyBySku,
    totalQty,
    totalSat,
  };
}

export function buildOrderFingerprint(customerId, deliveryDate, qtyBySku) {
  return [
    Number(customerId),
    String(deliveryDate).trim(),
    `FG-189L:${qtyBySku['FG-189L'] ?? 0}`,
    `FG-350ML:${qtyBySku['FG-350ML'] ?? 0}`,
    `FG-600ML:${qtyBySku['FG-600ML'] ?? 0}`,
    `FG-1500ML:${qtyBySku['FG-1500ML'] ?? 0}`,
  ].join('|');
}

export function mapOrderItemDto(row) {
  const qty = Number(row.qty ?? 0);
  const unitPriceSat = Number(row.unit_price_sat ?? 0);
  return {
    id: row.id,
    orderId: row.order_id,
    sku: row.sku,
    qty,
    unitPriceSat,
    unit_price_sat: unitPriceSat,
    lineTotalSat: qty * unitPriceSat,
    deliveredQty: Number(row.delivered_qty ?? 0),
    returnedQty: Number(row.returned_qty ?? 0),
  };
}

export function mapOrderDto(row, itemRows = []) {
  if (!row) return null;
  const items = itemRows.map(mapOrderItemDto);

  const quantities = {
    'FG-189L': 0,
    'FG-350ML': 0,
    'FG-600ML': 0,
    'FG-1500ML': 0,
  };
  for (const it of items) {
    if (ORDER_SKUS.includes(it.sku)) {
      quantities[it.sku] += it.qty;
    }
  }

  const totalSat = Number(row.total_sat ?? 0);
  const paidSat = Number(row.paid_sat ?? 0);

  return {
    id: row.id,
    code: row.code,
    customerId: row.customer_id,
    customerCode: row.customer_code ?? null,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    zone: row.customer_zone ?? null,
    address: row.customer_address ?? null,
    lat: row.customer_lat ?? null,
    lng: row.customer_lng ?? null,
    status: row.status,
    paymentStatus: derivePaymentStatus(totalSat, paidSat),
    deliveryDate: row.delivery_date,
    delivery_date: row.delivery_date,
    totalSat,
    total_sat: totalSat,
    paidSat,
    paid_sat: paidSat,
    unpaidSat: Math.max(0, totalSat - paidSat),
    paymentMode: row.payment_mode ?? null,
    notes: row.notes ?? null,
    source: row.source ?? 'staff',
    createdBy: row.created_by ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    quantities,
  };
}

function parseSqlUtcTimeMs(sqlTimestamp) {
  if (!sqlTimestamp) return 0;
  const str = String(sqlTimestamp).trim();
  const iso = str.includes('T') ? str : `${str.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function findRecentDuplicateOrderId(customerId, deliveryDate, qtyBySku) {
  const now = Date.now();
  const fp = buildOrderFingerprint(customerId, deliveryDate, qtyBySku);

  const memHit = recentOrderFingerprints.get(fp);
  if (memHit && now - memHit.timestampMs < DUPLICATE_WINDOW_MS) {
    const existingRow = repo.findOrderById(memHit.orderId);
    if (existingRow && existingRow.status !== 'cancelled') {
      return existingRow.id;
    }
  }

  const recentOrders = repo.listRecentCustomerOrdersOnDate(customerId, deliveryDate, 5);
  if (recentOrders.length === 0) return null;

  const recentIds = recentOrders.map((o) => o.id);
  const allItems = repo.getOrderItemsForOrderIds(recentIds);
  const itemsByOrder = new Map();
  for (const item of allItems) {
    const list = itemsByOrder.get(item.order_id) || [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  for (const ord of recentOrders) {
    const createdMs = parseSqlUtcTimeMs(ord.created_at);
    if (createdMs > 0 && Math.abs(now - createdMs) < DUPLICATE_WINDOW_MS) {
      const ordQty = {
        'FG-189L': 0,
        'FG-350ML': 0,
        'FG-600ML': 0,
        'FG-1500ML': 0,
      };
      for (const it of itemsByOrder.get(ord.id) || []) {
        if (ORDER_SKUS.includes(it.sku)) {
          ordQty[it.sku] += Number(it.qty || 0);
        }
      }
      if (buildOrderFingerprint(customerId, deliveryDate, ordQty) === fp) {
        return ord.id;
      }
    }
  }

  return null;
}

export function listOrders(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;

  const { rows, total } = repo.listOrders({
    offset,
    limit,
    customerId: query.customerId,
    zone: query.zone?.trim() || undefined,
    status: query.status || undefined,
    paymentStatus: query.paymentStatus || undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'delivery_date',
    order: query.order || 'desc',
  });

  const orderIds = rows.map((r) => r.id);
  const allItems = repo.getOrderItemsForOrderIds(orderIds);
  const itemsMap = new Map();
  for (const item of allItems) {
    const arr = itemsMap.get(item.order_id) || [];
    arr.push(item);
    itemsMap.set(item.order_id, arr);
  }

  return {
    data: rows.map((r) => mapOrderDto(r, itemsMap.get(r.id) || [])),
    pagination: computePaginationMeta(page, limit, total),
  };
}

export function getOrderById(id) {
  const orderId = Number(id);
  const row = repo.findOrderById(orderId);
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลออเดอร์');
  }

  const itemRows = repo.getOrderItemsByOrderId(orderId);
  const checkins = repo.listOrderCheckins(orderId).map((c) => {
    let delivered = {};
    try {
      delivered = JSON.parse(c.delivered_json || '{}');
    } catch {
      delivered = {};
    }
    return {
      id: c.id,
      orderId: c.order_id,
      customerId: c.customer_id,
      tripId: c.trip_id ?? null,
      delivered,
      returned189L: Number(c.returned_189l ?? 0),
      paymentMode: c.payment_mode,
      moneyReceivedSat: Number(c.money_received_sat ?? 0),
      notes: c.notes ?? null,
      performedBy: c.performed_by ?? null,
      createdAt: c.created_at,
    };
  });

  const receipts = repo.listOrderReceipts(orderId).map((rcp) => ({
    id: rcp.id,
    code: rcp.code,
    customerId: rcp.customer_id,
    orderId: rcp.order_id ?? null,
    checkinId: rcp.checkin_id ?? null,
    amountSat: Number(rcp.amount_sat ?? 0),
    method: rcp.method,
    printed: Boolean(rcp.printed),
    createdBy: rcp.created_by ?? null,
    createdAt: rcp.created_at,
  }));

  const dto = mapOrderDto(row, itemRows);
  return {
    ...dto,
    checkins,
    receipts,
  };
}

export function createOrder(payload, actorUserId = null) {
  const customerId = Number(payload.customerId);
  const customerRow = customersRepo.findCustomerById(customerId);
  if (!customerRow || !customerRow.is_active) {
    throw AppError.badRequest('ไม่พบลูกค้าหรือบัญชีลูกค้าถูกระงับการใช้งาน', [
      { field: 'body.customerId', issue: 'ไม่พบลูกค้าที่ใช้งานได้' },
    ]);
  }

  // ORD-2 / PRC-2: ดึงราคาต่อหน่วยจากทะเบียนลูกค้าเสมอ ห้ามเชื่อราคาจาก request body
  const priceRows = customersRepo.getCustomerPrices(customerId);
  const effectivePrices = resolveCustomerEffectivePrices(customerRow, priceRows);

  const { items, qtyBySku, totalSat } = buildOrderItemsAndTotal(
    payload.items,
    effectivePrices,
  );

  // ORD-3: กันกดส่งซ้ำภายใน 4 วินาที (ลูกค้า + จำนวนทุก SKU + วันส่ง เดียวกัน)
  const duplicateOrderId = findRecentDuplicateOrderId(
    customerId,
    payload.deliveryDate,
    qtyBySku,
  );
  if (duplicateOrderId !== null) {
    const existingOrder = getOrderById(duplicateOrderId);
    return {
      order: existingOrder,
      duplicateIgnored: true,
    };
  }

  const createdOrderId = repo.runInTransaction(() => {
    const prefix = buildOrderCodePrefix(payload.deliveryDate);
    const nextSeq = repo.getMaxOrderCodeSeqForPrefix(prefix) + 1;
    const code = formatOrderCode(payload.deliveryDate, nextSeq);

    const newOrderId = repo.insertOrder({
      code,
      customerId,
      status: 'draft',
      deliveryDate: payload.deliveryDate,
      totalSat,
      paidSat: 0,
      paymentMode: payload.paymentMode ?? null,
      notes: payload.notes?.trim() || null,
      source: 'staff',
      createdBy: actorUserId,
    });

    repo.replaceOrderItems(newOrderId, items);
    return newOrderId;
  });

  const fp = buildOrderFingerprint(customerId, payload.deliveryDate, qtyBySku);
  recentOrderFingerprints.set(fp, {
    orderId: createdOrderId,
    timestampMs: Date.now(),
  });

  return {
    order: getOrderById(createdOrderId),
    duplicateIgnored: false,
  };
}

export function updateOrder(id, payload) {
  const orderId = Number(id);
  const existing = repo.findOrderById(orderId);
  if (!existing) {
    throw AppError.notFound('ไม่พบออเดอร์ที่ต้องการแก้ไข');
  }

  // ORD-2: ออเดอร์ที่จัดส่งสำเร็จแล้ว (delivered) หรือยกเลิกแล้ว ห้ามแก้ไข (ตอบ 409 CONFLICT)
  if (existing.status === 'delivered') {
    throw AppError.conflict(
      `ออเดอร์ [${existing.code}] จัดส่งสำเร็จแล้ว ไม่อนุญาตให้แก้ไขข้อมูลเพื่อรักษาความถูกต้องของสต็อกและบัญชี`,
    );
  }
  if (existing.status === 'cancelled') {
    throw AppError.conflict(
      `ออเดอร์ [${existing.code}] ถูกยกเลิกแล้ว ไม่อนุญาตให้แก้ไขข้อมูล`,
    );
  }

  const targetCustomerId =
    payload.customerId !== undefined ? Number(payload.customerId) : existing.customer_id;
  const customerRow = customersRepo.findCustomerById(targetCustomerId);
  if (!customerRow || !customerRow.is_active) {
    throw AppError.badRequest('ไม่พบลูกค้าหรือบัญชีลูกค้าถูกระงับการใช้งาน', [
      { field: 'body.customerId', issue: 'ไม่พบลูกค้าที่ใช้งานได้' },
    ]);
  }

  const priceRows = customersRepo.getCustomerPrices(targetCustomerId);
  const effectivePrices = resolveCustomerEffectivePrices(customerRow, priceRows);

  repo.runInTransaction(() => {
    const updateFields = {};
    if (payload.customerId !== undefined) updateFields.customerId = targetCustomerId;
    if (payload.deliveryDate !== undefined) updateFields.deliveryDate = payload.deliveryDate;
    if (payload.status !== undefined) updateFields.status = payload.status;
    if (payload.paymentMode !== undefined) updateFields.paymentMode = payload.paymentMode;
    if (payload.notes !== undefined) updateFields.notes = payload.notes?.trim() || null;

    if (payload.items !== undefined) {
      const { items, totalSat } = buildOrderItemsAndTotal(payload.items, effectivePrices);
      updateFields.totalSat = totalSat;
      repo.replaceOrderItems(orderId, items);
    } else if (payload.customerId !== undefined && targetCustomerId !== existing.customer_id) {
      // ถ้าเปลี่ยนลูกค้าแต่ไม่ได้ส่ง items ใหม่ ต้องคำนวณราคาใหม่ตามลูกค้าที่เลือก
      const currentItems = repo.getOrderItemsByOrderId(orderId);
      const { items, totalSat } = buildOrderItemsAndTotal(currentItems, effectivePrices);
      updateFields.totalSat = totalSat;
      repo.replaceOrderItems(orderId, items);
    }

    repo.updateOrderById(orderId, updateFields);
  });

  return getOrderById(orderId);
}

export function confirmOrder(id) {
  const orderId = Number(id);
  const existing = repo.findOrderById(orderId);
  if (!existing) {
    throw AppError.notFound('ไม่พบออเดอร์ที่ต้องการยืนยัน');
  }

  if (existing.status === 'delivered') {
    throw AppError.conflict(`ออเดอร์ [${existing.code}] จัดส่งสำเร็จแล้ว ไม่สามารถเปลี่ยนสถานะได้`);
  }
  if (existing.status === 'cancelled') {
    throw AppError.conflict(`ออเดอร์ [${existing.code}] ถูกยกเลิกแล้ว ไม่สามารถยืนยันได้`);
  }

  repo.updateOrderById(orderId, { status: 'confirmed' });
  return getOrderById(orderId);
}

export function cancelOrder(id, payload = {}) {
  const orderId = Number(id);
  const existing = repo.findOrderById(orderId);
  if (!existing) {
    throw AppError.notFound('ไม่พบออเดอร์ที่ต้องการยกเลิก');
  }

  if (existing.status === 'delivered') {
    throw AppError.conflict(
      `ออเดอร์ [${existing.code}] จัดส่งสำเร็จแล้ว ไม่อนุญาตให้ยกเลิก`,
    );
  }

  const reason = (payload.reason ?? payload.notes ?? '').trim();
  let nextNotes = existing.notes ?? null;
  if (reason) {
    nextNotes = nextNotes ? `${nextNotes} | [ยกเลิก: ${reason}]` : `[ยกเลิก: ${reason}]`;
  }

  repo.updateOrderById(orderId, {
    status: 'cancelled',
    notes: nextNotes,
  });

  return getOrderById(orderId);
}

/**
 * ORD-6: เมื่อสร้างออเดอร์ ลูกค้าจะเข้าใบเส้นทางส่งของ (route-sheet) ของวันส่งนั้นอัตโนมัติ
 * คืนรายการป้ายจอดรายลูกค้า พร้อมจำนวนรวมทั้ง 4 SKU และยอดรวมที่ต้องเก็บในวันนั้น
 */
export function getRouteSheet(query = {}) {
  const date = query.date || new Date().toISOString().slice(0, 10);
  const zone = query.zone?.trim() || undefined;

  const activeOrders = repo.listActiveOrdersByDateAndZone({ date, zone });
  const orderIds = activeOrders.map((o) => o.id);
  const allItems = repo.getOrderItemsForOrderIds(orderIds);

  const itemsByOrder = new Map();
  for (const item of allItems) {
    const arr = itemsByOrder.get(item.order_id) || [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  /** @type {Map<number, any>} */
  const stopsByCustomer = new Map();
  const summaryQuantities = {
    'FG-189L': 0,
    'FG-350ML': 0,
    'FG-600ML': 0,
    'FG-1500ML': 0,
  };
  let summaryTotalSat = 0;

  for (const ord of activeOrders) {
    const ordItems = itemsByOrder.get(ord.id) || [];
    let stop = stopsByCustomer.get(ord.customer_id);
    if (!stop) {
      stop = {
        customerId: ord.customer_id,
        customerCode: ord.customer_code,
        customerName: ord.customer_name,
        phone: ord.customer_phone ?? null,
        zone: ord.customer_zone ?? null,
        address: ord.customer_address ?? null,
        lat: ord.customer_lat ?? null,
        lng: ord.customer_lng ?? null,
        outstandingBottles: Number(ord.customer_outstanding_bottles ?? 0),
        balanceSat: Number(ord.customer_balance_sat ?? 0),
        quantities: {
          'FG-189L': 0,
          'FG-350ML': 0,
          'FG-600ML': 0,
          'FG-1500ML': 0,
        },
        totalSat: 0,
        orderIds: [],
        orderCodes: [],
        orders: [],
      };
      stopsByCustomer.set(ord.customer_id, stop);
    }

    stop.orderIds.push(ord.id);
    stop.orderCodes.push(ord.code);
    stop.totalSat += Number(ord.total_sat ?? 0);
    summaryTotalSat += Number(ord.total_sat ?? 0);

    for (const it of ordItems) {
      if (ORDER_SKUS.includes(it.sku)) {
        const q = Number(it.qty ?? 0);
        stop.quantities[it.sku] += q;
        summaryQuantities[it.sku] += q;
      }
    }

    stop.orders.push(mapOrderDto(ord, ordItems));
  }

  const stops = Array.from(stopsByCustomer.values());

  return {
    date,
    zone: zone ?? null,
    totalStops: stops.length,
    totalOrders: activeOrders.length,
    totalSat: summaryTotalSat,
    quantities: summaryQuantities,
    stops,
    data: stops,
  };
}

const STATUS_LABELS_TH = {
  draft: 'ร่าง (Draft)',
  confirmed: 'ยืนยันแล้ว (Confirmed)',
  delivered: 'จัดส่งสำเร็จแล้ว',
  cancelled: 'ยกเลิก',
};

const PAYMENT_STATUS_LABELS_TH = {
  paid: 'ชำระครบแล้ว',
  partial: 'ชำระบางส่วน',
  unpaid: 'ค้างชำระ',
};

export async function exportOrdersXlsxBuffer(query = {}) {
  const rows = repo.listAllOrdersForExport({
    customerId: query.customerId,
    zone: query.zone?.trim() || undefined,
    status: query.status || undefined,
    paymentStatus: query.paymentStatus || undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    search: query.search?.trim() || undefined,
    sort: query.sort || 'delivery_date',
    order: query.order || 'desc',
  });

  const orderIds = rows.map((r) => r.id);
  const allItems = repo.getOrderItemsForOrderIds(orderIds);
  const itemsMap = new Map();
  for (const item of allItems) {
    const arr = itemsMap.get(item.order_id) || [];
    arr.push(item);
    itemsMap.set(item.order_id, arr);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inthara Smart Water ERP v2';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Orders');
  sheet.columns = [
    { header: 'เลขที่ออเดอร์ (Order Code)', key: 'code', width: 20 },
    { header: 'วันที่จัดส่ง (Delivery Date)', key: 'deliveryDate', width: 16 },
    { header: 'รหัสลูกค้า', key: 'customerCode', width: 14 },
    { header: 'ชื่อลูกค้า', key: 'customerName', width: 30 },
    { header: 'โซนจัดส่ง', key: 'zone', width: 22 },
    { header: 'ถัง 18.9L (ถัง)', key: 'qty189L', width: 15 },
    { header: 'แพ็ค 350ml (แพ็ค)', key: 'qty350ML', width: 16 },
    { header: 'แพ็ค 600ml (แพ็ค)', key: 'qty600ML', width: 16 },
    { header: 'แพ็ค 1500ml (แพ็ค)', key: 'qty1500ML', width: 17 },
    { header: 'ยอดรวมสุทธิ (บาท)', key: 'totalBaht', width: 18 },
    { header: 'ชำระแล้ว (บาท)', key: 'paidBaht', width: 16 },
    { header: 'สถานะออเดอร์', key: 'statusText', width: 20 },
    { header: 'สถานะชำระเงิน', key: 'paymentStatusText', width: 18 },
    { header: 'หมายเหตุ', key: 'notes', width: 28 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const dto = mapOrderDto(row, itemsMap.get(row.id) || []);
    sheet.addRow({
      code: dto.code,
      deliveryDate: dto.deliveryDate,
      customerCode: dto.customerCode || '-',
      customerName: dto.customerName || '-',
      zone: dto.zone || '-',
      qty189L: dto.quantities['FG-189L'],
      qty350ML: dto.quantities['FG-350ML'],
      qty600ML: dto.quantities['FG-600ML'],
      qty1500ML: dto.quantities['FG-1500ML'],
      totalBaht: satangToBaht(dto.totalSat),
      paidBaht: satangToBaht(dto.paidSat),
      statusText: STATUS_LABELS_TH[dto.status] || dto.status,
      paymentStatusText: PAYMENT_STATUS_LABELS_TH[dto.paymentStatus] || dto.paymentStatus,
      notes: dto.notes || '-',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export default {
  DUPLICATE_WINDOW_MS,
  resetOrderDuplicateWindow,
  buildOrderCodePrefix,
  formatOrderCode,
  derivePaymentStatus,
  buildOrderItemsAndTotal,
  buildOrderFingerprint,
  mapOrderDto,
  listOrders,
  getOrderById,
  createOrder,
  updateOrder,
  confirmOrder,
  cancelOrder,
  getRouteSheet,
  exportOrdersXlsxBuffer,
};
