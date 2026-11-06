import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import { satangToBaht } from '../../utils/money.js';
import * as billingRepo from '../billing/repo.js';
import * as customersRepo from '../customers/repo.js';
import { resolveCustomerEffectivePrices } from '../customers/service.js';
import * as ordersService from '../orders/service.js';
import * as repo from './repo.js';
import { ORDER_SKUS } from './schema.js';

const BCRYPT_COST = 10;
export const PORTAL_RATE_LIMIT_MAX = 5;
export const PORTAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 นาที
export const PORTAL_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 นาที

/** @type {Map<string, { count: number, resetAt: number }>} */
const portalRateWindow = new Map();

export function resetPortalRateLimiter() {
  portalRateWindow.clear();
}

export function portalRateLimiter(req, _res, next) {
  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const current = portalRateWindow.get(ip);

  if (!current || current.resetAt <= now) {
    portalRateWindow.set(ip, { count: 1, resetAt: now + PORTAL_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  current.count += 1;
  if (current.count > PORTAL_RATE_LIMIT_MAX) {
    return next(
      AppError.tooManyRequests(
        'พยายามเข้าสู่ระบบพอร์ทัลถี่เกินไป (เกิน 5 ครั้งใน 15 นาที) กรุณารอสักครู่แล้วลองใหม่',
      ),
    );
  }

  return next();
}

export function hashPortalPin(pin) {
  return bcrypt.hashSync(String(pin).trim(), BCRYPT_COST);
}

/**
 * POST /api/portal/login (PORTAL-1, PORTAL-2)
 */
export function loginPortal({ customerCode, pin }) {
  const cleanCode = String(customerCode || '').trim();
  const cleanPin = String(pin || '').trim();

  const customer = repo.findCustomerByCode(cleanCode);
  if (!customer) {
    throw AppError.unauthorized('รหัสลูกค้าหรือรหัส PIN ไม่ถูกต้อง');
  }

  const auth = repo.findPortalAuthByCustomerId(customer.id);
  if (!auth) {
    throw AppError.unauthorized(
      `ลูกค้า [${customer.code}] ยังไม่ได้เปิดใช้งานพอร์ทัล กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียน PIN`,
    );
  }

  if (Number(auth.enabled ?? 1) !== 1) {
    throw AppError.forbidden('บัญชีพอร์ทัลลูกค้านี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่');
  }

  // ตรวจการถูกล็อกชั่วคราว (PORTAL-2: ล็อก 15 นาที)
  if (auth.lock_until) {
    const lockUntilMs = new Date(auth.lock_until).getTime();
    if (lockUntilMs > Date.now()) {
      const lockMinutes = Math.max(1, Math.ceil((lockUntilMs - Date.now()) / 60000));
      throw AppError.accountLocked(
        lockMinutes,
        `บัญชีพอร์ทัลถูกระงับชั่วคราวเนื่องจากใส่ PIN ผิดครบ 5 ครั้ง กรุณารออีก ${lockMinutes} นาที หรือติดต่อเจ้าหน้าที่เพื่อปลดล็อก`,
      );
    }
  }

  const isMatch = bcrypt.compareSync(cleanPin, auth.pin_hash);
  if (!isMatch) {
    const failedAttempts = Number(auth.failed_attempts || 0) + 1;
    if (failedAttempts >= 5) {
      const lockUntil = new Date(Date.now() + PORTAL_LOCK_DURATION_MS).toISOString();
      repo.updatePortalAttempts(customer.id, failedAttempts, lockUntil);
      throw AppError.accountLocked(
        15,
        'ใส่รหัส PIN ผิดครบ 5 ครั้ง บัญชีพอร์ทัลถูกระงับชั่วคราว 15 นาที กรุณาติดต่อเจ้าหน้าที่เพื่อปลดล็อก',
      );
    }

    repo.updatePortalAttempts(customer.id, failedAttempts, null);
    const remaining = 5 - failedAttempts;
    throw AppError.unauthorized(
      `รหัสลูกค้าหรือ PIN ไม่ถูกต้อง (เหลือโอกาสลองอีก ${remaining} ครั้งก่อนบัญชีจะถูกระงับ 15 นาที)`,
    );
  }

  // ล็อกอินสำเร็จ -> รีเซ็ตจำนวนครั้งที่ผิด
  repo.updatePortalAttempts(customer.id, 0, null);

  const payload = {
    sub: customer.id,
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
    scope: 'portal',
    role: 'customer',
  };

  const token = jwt.sign(payload, config.jwt.secret, { expiresIn: '7d' });

  return {
    token,
    accessToken: token,
    tokenType: 'Bearer',
    customer: {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      zone: customer.zone ?? null,
      phone: customer.phone ?? null,
    },
  };
}

/**
 * GET /api/portal/me (PORTAL-3)
 * ราคาประจำ 4 SKU + ยอดค้างชำระ + ถังค้างส่ง + ประวัติออเดอร์ 3 เดือนล่าสุด
 */
export function getPortalMe(customerId) {
  const customer = repo.findCustomerById(customerId);
  if (!customer || Number(customer.is_active ?? 1) !== 1) {
    throw AppError.notFound('ไม่พบข้อมูลลูกค้า หรือบัญชีถูกปิดการใช้งาน');
  }

  const priceRows = customersRepo.getCustomerPrices(customerId);
  const effectivePrices = resolveCustomerEffectivePrices(customer, priceRows);

  const prices = {};
  for (const sku of ORDER_SKUS) {
    const sat = Number(effectivePrices[sku] ?? 0);
    prices[sku] = {
      sku,
      unitPriceSat: sat,
      unitPriceBaht: satangToBaht(sat),
    };
  }

  // คำนวณยอดหนี้ค้างชำระ (ออเดอร์ delivered ที่ค้างชำระ หักลบยอดเงินมัดจำ/เครดิตคงเหลือ)
  const unpaidOrders = billingRepo.listCustomerUnpaidOrdersFifo(customerId);
  const totalUnpaidSat = unpaidOrders.reduce(
    (sum, o) => sum + Math.max(0, Number(o.total_sat ?? 0) - Number(o.paid_sat ?? 0)),
    0,
  );
  const depositBalanceSat = Math.max(0, Number(customer.balance_sat ?? 0));
  const outstandingDebtSat = Math.max(0, totalUnpaidSat - depositBalanceSat);

  // ดึงประวัติออเดอร์ 3 เดือนล่าสุด
  const recentOrderRows = repo.listRecentOrders3Months(customerId);
  const orderIds = recentOrderRows.map((r) => r.id);
  const allItemRows = repo.getOrderItemsForOrderIds(orderIds);
  const itemsByOrderId = new Map();
  for (const it of allItemRows) {
    if (!itemsByOrderId.has(it.order_id)) {
      itemsByOrderId.set(it.order_id, []);
    }
    itemsByOrderId.get(it.order_id).push(ordersService.mapOrderItemDto(it));
  }

  const recentOrders = recentOrderRows.map((ord) =>
    ordersService.mapOrderDto(ord, itemsByOrderId.get(ord.id) || []),
  );

  return {
    customer: {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      contactPerson: customer.contact_person ?? null,
      phone: customer.phone ?? null,
      zone: customer.zone ?? null,
      address: customer.address ?? null,
    },
    prices,
    financial: {
      depositBalanceSat,
      depositBalanceBaht: satangToBaht(depositBalanceSat),
      totalUnpaidSat,
      totalUnpaidBaht: satangToBaht(totalUnpaidSat),
      outstandingDebtSat,
      outstandingDebtBaht: satangToBaht(outstandingDebtSat),
      unreturnedBottles: Math.max(0, Number(customer.outstanding_bottles ?? 0)),
      outstandingBottles: Math.max(0, Number(customer.outstanding_bottles ?? 0)),
    },
    unreturnedBottles: Math.max(0, Number(customer.outstanding_bottles ?? 0)),
    outstandingBottles: Math.max(0, Number(customer.outstanding_bottles ?? 0)),
    outstandingDebtSat,
    outstandingDebtBaht: satangToBaht(outstandingDebtSat),
    depositBalanceSat,
    depositBalanceBaht: satangToBaht(depositBalanceSat),
    recentOrders,
  };
}

/**
 * POST /api/portal/orders (PORTAL-4)
 * ส่งคำสั่งซื้อเอง -> กลายเป็นออเดอร์ status='draft', source='portal' (รอ staff ยืนยัน — ห้ามตัดสต็อก/สร้างหนี้)
 */
export function createPortalOrder(customerId, payload) {
  const customer = repo.findCustomerById(customerId);
  if (!customer || Number(customer.is_active ?? 1) !== 1) {
    throw AppError.notFound('ไม่พบข้อมูลลูกค้า หรือบัญชีถูกปิดการใช้งาน');
  }

  const deliveryDate =
    payload.deliveryDate || new Date().toISOString().slice(0, 10);

  const result = ordersService.createOrder(
    {
      customerId,
      deliveryDate,
      items: payload.items,
      notes: payload.notes?.trim() || null,
      source: 'portal',
    },
    null,
  );

  return result.order;
}

/**
 * GET /api/portal/my/orders?page=1&limit=20
 * ประวัติออเดอร์ของตัวเองเท่านั้น
 */
export function listMyPortalOrders(customerId, query = {}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit ?? 20)));

  const { rows, total } = repo.listCustomerOrdersPaginated(customerId, { page, limit });
  const orderIds = rows.map((r) => r.id);
  const allItemRows = repo.getOrderItemsForOrderIds(orderIds);
  const itemsByOrderId = new Map();
  for (const it of allItemRows) {
    if (!itemsByOrderId.has(it.order_id)) {
      itemsByOrderId.set(it.order_id, []);
    }
    itemsByOrderId.get(it.order_id).push(ordersService.mapOrderItemDto(it));
  }

  const items = rows.map((r) => ordersService.mapOrderDto(r, itemsByOrderId.get(r.id) || []));

  return {
    items,
    data: items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Admin: POST /api/customers/:id/portal/register (ตั้ง PIN แรก)
 */
export function registerCustomerPortal(customerId, pin) {
  const customer = repo.findCustomerById(customerId);
  if (!customer) {
    throw AppError.notFound(`ไม่พบลูกค้าหมายเลข ID ${customerId}`);
  }

  const pinHash = hashPortalPin(pin);
  repo.upsertPortalAuth({ customerId: customer.id, pinHash, enabled: 1 });

  return {
    success: true,
    message: `ลงทะเบียนพอร์ทัลลูกค้า [${customer.code}] ${customer.name} เรียบร้อยแล้ว`,
    customerId: customer.id,
    customerCode: customer.code,
  };
}

/**
 * Admin: POST /api/customers/:id/portal/reset-pin (รีเซ็ต PIN)
 */
export function resetCustomerPortalPin(customerId, pin) {
  const customer = repo.findCustomerById(customerId);
  if (!customer) {
    throw AppError.notFound(`ไม่พบลูกค้าหมายเลข ID ${customerId}`);
  }

  const auth = repo.findPortalAuthByCustomerId(customer.id);
  if (!auth) {
    throw AppError.badRequest('ลูกค้ายังไม่ได้ลงทะเบียนพอร์ทัล กรุณาลงทะเบียนก่อน');
  }

  const pinHash = hashPortalPin(pin);
  repo.upsertPortalAuth({ customerId: customer.id, pinHash, enabled: 1 });

  return {
    success: true,
    message: `รีเซ็ตรหัส PIN พอร์ทัลของลูกค้า [${customer.code}] เรียบร้อยแล้ว`,
    customerId: customer.id,
    customerCode: customer.code,
  };
}

/**
 * Admin: POST /api/customers/:id/portal/unlock (ปลดล็อกพอร์ทัล)
 */
export function unlockCustomerPortal(customerId) {
  const customer = repo.findCustomerById(customerId);
  if (!customer) {
    throw AppError.notFound(`ไม่พบลูกค้าหมายเลข ID ${customerId}`);
  }

  const auth = repo.findPortalAuthByCustomerId(customer.id);
  if (!auth) {
    throw AppError.badRequest('ลูกค้ายังไม่ได้ลงทะเบียนพอร์ทัล');
  }

  repo.resetPortalLock(customer.id);

  return {
    success: true,
    message: `ปลดล็อกบัญชีพอร์ทัลของลูกค้า [${customer.code}] สำเร็จ`,
    customerId: customer.id,
    customerCode: customer.code,
  };
}

/**
 * Admin: GET /api/customers/:id/portal/access-status
 */
export function getCustomerPortalAccessStatus(customerId) {
  const customer = repo.findCustomerById(customerId);
  if (!customer) {
    throw AppError.notFound(`ไม่พบลูกค้าหมายเลข ID ${customerId}`);
  }

  const auth = repo.findPortalAuthByCustomerId(customer.id);
  if (!auth) {
    return {
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      registered: false,
      enabled: false,
      failedAttempts: 0,
      lockUntil: null,
      isLocked: false,
      registeredAt: null,
    };
  }

  const lockUntilMs = auth.lock_until ? new Date(auth.lock_until).getTime() : 0;
  const isLocked = lockUntilMs > Date.now();

  return {
    customerId: customer.id,
    customerCode: customer.code,
    customerName: customer.name,
    registered: true,
    enabled: Number(auth.enabled ?? 1) === 1,
    failedAttempts: Number(auth.failed_attempts ?? 0),
    lockUntil: auth.lock_until ?? null,
    isLocked,
    registeredAt: auth.registered_at ?? null,
  };
}
