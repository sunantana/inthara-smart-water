import ExcelJS from 'exceljs';
import { AppError } from '../../utils/errors.js';
import { satangToBaht } from '../../utils/money.js';
import * as repo from './repo.js';
import { CUSTOMER_SKUS } from './schema.js';

export const DEFAULT_PRICES_SAT = Object.freeze({
  'FG-189L': 1500,
  'FG-350ML': 3500,
  'FG-600ML': 3500,
  'FG-1500ML': 3500,
});

const ALLOWED_GMAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.co.th',
  'www.google.co.th',
  'maps.google.co.th',
]);

export function formatCustomerCode(seq) {
  const num = Math.max(1, Number(seq) || 1);
  return `CUS-${String(num).padStart(4, '0')}`;
}

export function computePaginationMeta(page, limit, total) {
  const cleanPage = Math.max(1, Number(page) || 1);
  const cleanLimit = Math.max(1, Number(limit) || 50);
  const cleanTotal = Math.max(0, Number(total) || 0);
  return {
    page: cleanPage,
    limit: cleanLimit,
    total: cleanTotal,
    totalPages: Math.max(1, Math.ceil(cleanTotal / cleanLimit)),
  };
}

function cleanText(val) {
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * จัดรูปแบบและเติมค่าที่อยู่ไทยตาม schema ของตาราง customers (CRM-1)
 */
export function normalizeCustomer(input, existing = null) {
  const pick = (key, fallback = null) => {
    if (input[key] !== undefined) return cleanText(input[key]);
    if (existing && existing[key] !== undefined) return cleanText(existing[key]);
    return fallback;
  };

  const customerType = input.customerType ?? existing?.customer_type ?? 'shop';
  const name = (input.name ?? existing?.name ?? '').trim();
  const contactPerson = pick('contactPerson', existing?.contact_person ?? null);
  const phone = pick('phone', existing?.phone ?? null);
  const taxId = pick('taxId', existing?.tax_id ?? null);
  const branchType = pick('branchType', existing?.branch_type ?? 'สำนักงานใหญ่');

  const houseNo = pick('houseNo', existing?.house_no ?? null);
  const rawMoo = pick('moo', existing?.moo ?? null);
  const moo =
    rawMoo && /^\d+$/.test(rawMoo)
      ? `หมู่ ${rawMoo}`
      : rawMoo;
  const subdistrict = pick('subdistrict', existing?.subdistrict ?? null);
  const district = pick('district', existing?.district ?? null);
  const province = pick('province', existing?.province ?? null);
  const postalCode = pick('postalCode', existing?.postal_code ?? null);

  let zone = pick('zone', existing?.zone ?? null);
  if (!zone && subdistrict) {
    zone = `โซนท่าปลา - ต.${subdistrict}`;
  }

  let address = pick('address', null);
  if (!address) {
    const parts = [];
    if (houseNo) parts.push(`บ้านเลขที่ ${houseNo}`);
    if (moo) parts.push(moo);
    if (subdistrict) parts.push(`ต.${subdistrict}`);
    if (district) parts.push(`อ.${district}`);
    if (province) parts.push(`จ.${province}`);
    if (postalCode) parts.push(postalCode);
    address = parts.length > 0 ? parts.join(' ') : cleanText(existing?.address ?? null);
  }

  const lat =
    input.lat !== undefined
      ? input.lat
      : existing?.lat !== undefined
        ? existing.lat
        : null;
  const lng =
    input.lng !== undefined
      ? input.lng
      : existing?.lng !== undefined
        ? existing.lng
        : null;

  const priceTierId =
    input.priceTierId !== undefined
      ? input.priceTierId
      : existing?.price_tier_id !== undefined
        ? existing.price_tier_id
        : null;

  const outstandingBottles =
    input.outstandingBottles !== undefined
      ? Math.max(0, Number(input.outstandingBottles))
      : Number(existing?.outstanding_bottles ?? 0);

  const balanceSat =
    input.balanceSat !== undefined
      ? Number(input.balanceSat)
      : Number(existing?.balance_sat ?? 0);

  const creditTermDays =
    input.creditTermDays !== undefined
      ? Math.max(0, Number(input.creditTermDays))
      : Number(existing?.credit_term_days ?? 0);

  const isActive =
    input.isActive !== undefined
      ? Boolean(input.isActive)
      : existing?.is_active !== undefined
        ? Boolean(existing.is_active)
        : true;

  return {
    customerType,
    name,
    contactPerson,
    phone,
    taxId,
    branchType,
    zone,
    houseNo,
    moo,
    subdistrict,
    district,
    province,
    postalCode,
    address,
    lat,
    lng,
    priceTierId,
    outstandingBottles,
    balanceSat,
    creditTermDays,
    isActive,
  };
}

export function resolveCustomerEffectivePrices(row, priceRows = []) {
  const tierPrices = {
    'FG-189L': row?.tier_189l_sat ?? DEFAULT_PRICES_SAT['FG-189L'],
    'FG-350ML': row?.tier_350ml_sat ?? DEFAULT_PRICES_SAT['FG-350ML'],
    'FG-600ML': row?.tier_600ml_sat ?? DEFAULT_PRICES_SAT['FG-600ML'],
    'FG-1500ML': row?.tier_1500ml_sat ?? DEFAULT_PRICES_SAT['FG-1500ML'],
  };

  for (const p of priceRows) {
    if (CUSTOMER_SKUS.includes(p.sku) && Number.isInteger(p.unit_price_sat)) {
      tierPrices[p.sku] = p.unit_price_sat;
    }
  }

  return tierPrices;
}

export function mapCustomerDto(row, priceRows = []) {
  if (!row) return null;
  const prices = resolveCustomerEffectivePrices(row, priceRows);

  return {
    id: row.id,
    code: row.code,
    customerType: row.customer_type,
    name: row.name,
    contactPerson: row.contact_person ?? null,
    phone: row.phone ?? null,
    taxId: row.tax_id ?? null,
    branchType: row.branch_type ?? null,
    zone: row.zone ?? null,
    houseNo: row.house_no ?? null,
    moo: row.moo ?? null,
    subdistrict: row.subdistrict ?? null,
    district: row.district ?? null,
    province: row.province ?? null,
    postalCode: row.postal_code ?? null,
    address: row.address ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    priceTierId: row.price_tier_id ?? null,
    priceTierName: row.price_tier_name ?? null,
    outstandingBottles: Number(row.outstanding_bottles ?? 0),
    outstanding_bottles: Number(row.outstanding_bottles ?? 0),
    balanceSat: Number(row.balance_sat ?? 0),
    balance_sat: Number(row.balance_sat ?? 0),
    balance: Number(row.balance_sat ?? 0),
    creditTermDays: Number(row.credit_term_days ?? 0),
    isActive: Boolean(row.is_active),
    prices,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPriceHistoryDto(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    sku: row.sku,
    oldPriceSat: row.old_price_sat ?? null,
    newPriceSat: row.new_price_sat,
    changedBy: row.changed_by ?? null,
    changedByUsername: row.changed_by_username ?? null,
    changedByName: row.changed_by_name ?? null,
    createdAt: row.created_at,
  };
}

function parseActiveParam(activeParam) {
  if (activeParam === 'all') return undefined;
  if (activeParam === undefined) return true; // ค่าเริ่มต้นแสดงเฉพาะ active=1
  return activeParam === '1' || activeParam === 'true';
}

export function listCustomers(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;
  const isActive = parseActiveParam(query.active);

  const { rows, total } = repo.listCustomers({
    offset,
    limit,
    search: query.search?.trim() || undefined,
    zone: query.zone?.trim() || undefined,
    type: query.type || undefined,
    isActive,
    sort: query.sort || 'id',
    order: query.order || 'asc',
  });

  const ids = rows.map((r) => r.id);
  const allPrices = repo.getCustomerPricesForIds(ids);
  const priceMap = new Map();
  for (const p of allPrices) {
    const arr = priceMap.get(p.customer_id) || [];
    arr.push(p);
    priceMap.set(p.customer_id, arr);
  }

  return {
    data: rows.map((r) => mapCustomerDto(r, priceMap.get(r.id) || [])),
    pagination: computePaginationMeta(page, limit, total),
  };
}

export function getCustomerById(id) {
  const customerId = Number(id);
  const row = repo.findCustomerById(customerId);
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลลูกค้า');
  }

  const priceRows = repo.getCustomerPrices(customerId);
  const recentOrders = repo.listRecentCustomerOrders(customerId, 5).map((o) => ({
    id: o.id,
    code: o.code,
    customerId: o.customer_id,
    status: o.status,
    deliveryDate: o.delivery_date,
    totalSat: o.total_sat,
    paidSat: o.paid_sat,
    paymentMode: o.payment_mode ?? null,
    notes: o.notes ?? null,
    createdAt: o.created_at,
  }));
  const priceHistory = repo.listCustomerPriceHistory(customerId, 30).map(mapPriceHistoryDto);

  const dto = mapCustomerDto(row, priceRows);
  return {
    ...dto,
    recentOrders,
    history: recentOrders,
    priceHistory,
  };
}

export function createCustomer(payload, actorUserId = null) {
  let tierRow = null;
  if (payload.priceTierId != null) {
    tierRow = repo.findPriceTierById(Number(payload.priceTierId));
    if (!tierRow) {
      throw AppError.badRequest('ไม่พบระดับราคา (Price Tier) ที่ระบุ', [
        { field: 'body.priceTierId', issue: 'ไม่พบระดับราคา' },
      ]);
    }
  }

  const normalized = normalizeCustomer(payload);

  const initialPrices = {
    'FG-189L': tierRow ? tierRow.price_189l_sat : DEFAULT_PRICES_SAT['FG-189L'],
    'FG-350ML': tierRow ? tierRow.price_350ml_sat : DEFAULT_PRICES_SAT['FG-350ML'],
    'FG-600ML': tierRow ? tierRow.price_600ml_sat : DEFAULT_PRICES_SAT['FG-600ML'],
    'FG-1500ML': tierRow ? tierRow.price_1500ml_sat : DEFAULT_PRICES_SAT['FG-1500ML'],
    ...(payload.prices ?? {}),
  };

  const createdId = repo.runInTransaction(() => {
    const nextSeq = repo.getMaxCustomerCodeSeq() + 1;
    const code = formatCustomerCode(nextSeq);
    const newId = repo.insertCustomer({
      ...normalized,
      code,
    });

    for (const sku of CUSTOMER_SKUS) {
      const unitPriceSat = initialPrices[sku];
      repo.upsertCustomerPrice({
        customerId: newId,
        sku,
        unitPriceSat,
        updatedBy: actorUserId,
      });
      repo.insertCustomerPriceHistory({
        customerId: newId,
        sku,
        oldPriceSat: null,
        newPriceSat: unitPriceSat,
        changedBy: actorUserId,
      });
    }

    return newId;
  });

  return getCustomerById(createdId);
}

export function updateCustomer(id, payload) {
  const customerId = Number(id);
  const existing = repo.findCustomerById(customerId);
  if (!existing) {
    throw AppError.notFound('ไม่พบลูกค้าที่ต้องการแก้ไข');
  }

  if (payload.priceTierId !== undefined && payload.priceTierId !== null) {
    const tierRow = repo.findPriceTierById(Number(payload.priceTierId));
    if (!tierRow) {
      throw AppError.badRequest('ไม่พบระดับราคา (Price Tier) ที่ระบุ', [
        { field: 'body.priceTierId', issue: 'ไม่พบระดับราคา' },
      ]);
    }
  }

  const normalized = normalizeCustomer(payload, existing);
  repo.updateCustomerById(customerId, normalized);
  return getCustomerById(customerId);
}

export function softDeleteCustomer(id) {
  const customerId = Number(id);
  const existing = repo.findCustomerById(customerId);
  if (!existing) {
    throw AppError.notFound('ไม่พบลูกค้าที่ต้องการลบ');
  }

  const activeOrderCount = repo.countActiveOrdersByCustomer(customerId);
  if (activeOrderCount > 0) {
    throw AppError.conflict(
      `ไม่สามารถระงับลูกค้า [${existing.code}] ได้ เนื่องจากมีออเดอร์ที่ยังเปิดอยู่ ${activeOrderCount} รายการ`,
    );
  }

  const updated = repo.softDeleteCustomerById(customerId);
  const priceRows = repo.getCustomerPrices(customerId);
  return mapCustomerDto(updated, priceRows);
}

export function updateCustomerPrices(id, pricesPayload, actorUserId = null) {
  const customerId = Number(id);
  const existing = repo.findCustomerById(customerId);
  if (!existing) {
    throw AppError.notFound('ไม่พบลูกค้าที่ต้องการแก้ไขราคา');
  }

  const currentPriceRows = repo.getCustomerPrices(customerId);
  const currentPrices = resolveCustomerEffectivePrices(existing, currentPriceRows);

  repo.runInTransaction(() => {
    for (const [sku, newPriceSat] of Object.entries(pricesPayload)) {
      if (!CUSTOMER_SKUS.includes(sku)) continue;
      const oldPriceSat = currentPrices[sku] ?? null;
      repo.upsertCustomerPrice({
        customerId,
        sku,
        unitPriceSat: newPriceSat,
        updatedBy: actorUserId,
      });
      if (oldPriceSat !== newPriceSat) {
        repo.insertCustomerPriceHistory({
          customerId,
          sku,
          oldPriceSat,
          newPriceSat,
          changedBy: actorUserId,
        });
      }
    }
  });

  return getCustomerById(customerId);
}

export function listCustomerOrders(id, query = {}) {
  const customerId = Number(id);
  const existing = repo.findCustomerById(customerId);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลลูกค้า');
  }

  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;
  const { rows, total } = repo.listCustomerOrdersPaginated(customerId, { offset, limit });

  return {
    data: rows,
    pagination: computePaginationMeta(page, limit, total),
  };
}

export function listCustomerLedger(id, query = {}) {
  const customerId = Number(id);
  const existing = repo.findCustomerById(customerId);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลลูกค้า');
  }

  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;
  const { rows, total } = repo.listCustomerLedgerPaginated(customerId, { offset, limit });

  return {
    data: rows,
    pagination: computePaginationMeta(page, limit, total),
  };
}

export function extractLatLngFromText(text) {
  if (!text) return null;
  const source = String(text);

  // 1) รูปแบบ !3dLAT!4dLNG (พิกัดปักหมุดสถานที่จริงใน Google Maps)
  const mPlace = source.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (mPlace) {
    const lat = Number.parseFloat(mPlace[1]);
    const lng = Number.parseFloat(mPlace[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // 2) รูปแบบ query parameter ?q=LAT,LNG หรือ &ll=LAT,LNG หรือ &query=LAT,LNG หรือ destination=LAT,LNG
  let decoded = source;
  try {
    decoded = decodeURIComponent(source);
  } catch {
    // ignore decode error
  }
  const mQuery = decoded.match(
    /[?&](?:q|ll|query|destination|center|daddr)=(-?\d+\.\d+)\s*[,+]\s*(-?\d+\.\d+)/i,
  );
  if (mQuery) {
    const lat = Number.parseFloat(mQuery[1]);
    const lng = Number.parseFloat(mQuery[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // 3) รูปแบบ @LAT,LNG ใน path ของ Google Maps
  const mAt = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (mAt) {
    const lat = Number.parseFloat(mAt[1]);
    const lng = Number.parseFloat(mAt[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // 4) รูปแบบ /search/LAT,LNG หรือ /place/LAT,LNG
  const mPath = decoded.match(/\/(?:search|place|dir)\/(-?\d+\.\d+)\s*[,+]\s*(-?\d+\.\d+)/);
  if (mPath) {
    const lat = Number.parseFloat(mPath[1]);
    const lng = Number.parseFloat(mPath[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function isAllowedGoogleMapsUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_GMAPS_HOSTS.has(host)) return true;
  return host.endsWith('.google.com') || host.endsWith('.google.co.th') || host.endsWith('.goo.gl');
}

/**
 * แปลงลิงก์ Google Maps (รวมถึงลิงก์สั้น maps.app.goo.gl) เป็นพิกัด { lat, lng }
 * จำกัดการตาม redirect ไม่เกิน 5 hop และอนุญาตเฉพาะโดเมน Google Maps
 */
export async function resolveGoogleMapsUrl(rawUrl, fetchImpl = globalThis.fetch) {
  const trimmed = String(rawUrl || '').trim();
  if (!isAllowedGoogleMapsUrl(trimmed)) {
    throw AppError.badRequest(
      'อนุญาตเฉพาะลิงก์จาก Google Maps (maps.google.com หรือ maps.app.goo.gl) เท่านั้น',
      [{ field: 'body.url', issue: 'โดเมนไม่อยู่ในรายการที่อนุญาต' }],
    );
  }

  // ลองดึงจาก URL ต้นทางก่อน (กรณีเป็นลิงก์เต็มอยู่แล้ว)
  const directCoords = extractLatLngFromText(trimmed);
  if (directCoords) {
    return {
      lat: directCoords.lat,
      lng: directCoords.lng,
      resolvedUrl: trimmed,
      hops: 0,
    };
  }

  let currentUrl = trimmed;
  let hops = 0;
  const maxHops = 5;
  let lastHtml = '';

  while (hops < maxHops) {
    if (!isAllowedGoogleMapsUrl(currentUrl)) {
      throw AppError.badRequest('Redirect ออกนอกโดเมน Google Maps ที่อนุญาต');
    }

    const res = await fetchImpl(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;

      const nextUrl = new URL(location, currentUrl).toString();
      hops += 1;
      currentUrl = nextUrl;

      const coordsFromRedirect = extractLatLngFromText(currentUrl);
      if (coordsFromRedirect) {
        return {
          lat: coordsFromRedirect.lat,
          lng: coordsFromRedirect.lng,
          resolvedUrl: currentUrl,
          hops,
        };
      }
      continue;
    }

    if (typeof res.text === 'function') {
      lastHtml = await res.text();
    }
    break;
  }

  const coordsFromFinalUrl = extractLatLngFromText(currentUrl);
  if (coordsFromFinalUrl) {
    return {
      lat: coordsFromFinalUrl.lat,
      lng: coordsFromFinalUrl.lng,
      resolvedUrl: currentUrl,
      hops,
    };
  }

  const coordsFromHtml = extractLatLngFromText(lastHtml);
  if (coordsFromHtml) {
    return {
      lat: coordsFromHtml.lat,
      lng: coordsFromHtml.lng,
      resolvedUrl: currentUrl,
      hops,
    };
  }

  throw AppError.badRequest('ไม่พบพิกัด (lat, lng) ในลิงก์ Google Maps ที่ระบุ');
}

const CUSTOMER_TYPE_LABELS = {
  person: 'บุคคลทั่วไป',
  shop: 'ร้านค้า',
  organization: 'หน่วยงาน/องค์กร',
};

export async function exportCustomersXlsxBuffer(query = {}) {
  const isActive = parseActiveParam(query.active);
  const rows = repo.listAllCustomersForExport({
    search: query.search?.trim() || undefined,
    zone: query.zone?.trim() || undefined,
    type: query.type || undefined,
    isActive,
    sort: query.sort || 'id',
    order: query.order || 'asc',
  });

  const ids = rows.map((r) => r.id);
  const allPrices = repo.getCustomerPricesForIds(ids);
  const priceMap = new Map();
  for (const p of allPrices) {
    const arr = priceMap.get(p.customer_id) || [];
    arr.push(p);
    priceMap.set(p.customer_id, arr);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inthara Smart Water ERP v2';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Customers');
  sheet.columns = [
    { header: 'รหัสลูกค้า (Code)', key: 'code', width: 14 },
    { header: 'ประเภท (Type)', key: 'customerType', width: 18 },
    { header: 'ชื่อลูกค้า (Name)', key: 'name', width: 32 },
    { header: 'ผู้ติดต่อ', key: 'contactPerson', width: 22 },
    { header: 'โทรศัพท์', key: 'phone', width: 16 },
    { header: 'โซนจัดส่ง', key: 'zone', width: 24 },
    { header: 'ที่อยู่', key: 'address', width: 42 },
    { header: 'ระดับราคา (Tier)', key: 'priceTierName', width: 20 },
    { header: 'ราคา 18.9L (บาท)', key: 'price189LBaht', width: 16 },
    { header: 'ราคา 350ml (บาท)', key: 'price350mlBaht', width: 16 },
    { header: 'ราคา 600ml (บาท)', key: 'price600mlBaht', width: 16 },
    { header: 'ราคา 1500ml (บาท)', key: 'price1500mlBaht', width: 16 },
    { header: 'ถังค้าง (ใบ)', key: 'outstandingBottles', width: 14 },
    { header: 'มัดจำ/เครดิตคงเหลือ (บาท)', key: 'balanceBaht', width: 22 },
    { header: 'สถานะ', key: 'statusText', width: 14 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const dto = mapCustomerDto(row, priceMap.get(row.id) || []);
    sheet.addRow({
      code: dto.code,
      customerType: CUSTOMER_TYPE_LABELS[dto.customerType] || dto.customerType,
      name: dto.name,
      contactPerson: dto.contactPerson || '-',
      phone: dto.phone || '-',
      zone: dto.zone || '-',
      address: dto.address || '-',
      priceTierName: dto.priceTierName || 'กำหนดเอง',
      price189LBaht: satangToBaht(dto.prices['FG-189L']),
      price350mlBaht: satangToBaht(dto.prices['FG-350ML']),
      price600mlBaht: satangToBaht(dto.prices['FG-600ML']),
      price1500mlBaht: satangToBaht(dto.prices['FG-1500ML']),
      outstandingBottles: dto.outstandingBottles,
      balanceBaht: satangToBaht(dto.balanceSat),
      statusText: dto.isActive ? 'ใช้งานปกติ' : 'ระงับใช้งาน',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export default {
  formatCustomerCode,
  computePaginationMeta,
  normalizeCustomer,
  resolveCustomerEffectivePrices,
  mapCustomerDto,
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  updateCustomerPrices,
  listCustomerOrders,
  listCustomerLedger,
  extractLatLngFromText,
  resolveGoogleMapsUrl,
  exportCustomersXlsxBuffer,
};
