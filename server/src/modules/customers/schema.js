import { z } from 'zod';

export const CUSTOMER_TYPES = /** @type {const} */ (['person', 'shop', 'organization']);
export const CUSTOMER_SKUS = /** @type {const} */ ([
  'FG-189L',
  'FG-350ML',
  'FG-600ML',
  'FG-1500ML',
]);

const satangInt = z.coerce
  .number({ message: 'จำนวนเงินต้องเป็นตัวเลขหน่วยสตางค์' })
  .int('จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์ (satang integer)')
  .min(0, 'จำนวนเงินต้องไม่ติดลบ');

export const customerIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสลูกค้าไม่ถูกต้อง'),
});

export const customersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  zone: z.string().trim().max(120).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
  active: z.enum(['0', '1', 'true', 'false', 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z
    .enum(['id', 'code', 'name', 'zone', 'outstanding_bottles', 'balance_sat', 'created_at'])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const customerSubresourceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});

const pricesMapSchema = z
  .object({
    'FG-189L': satangInt.optional(),
    'FG-350ML': satangInt.optional(),
    'FG-600ML': satangInt.optional(),
    'FG-1500ML': satangInt.optional(),
  })
  .strict();

export const createCustomerSchema = z.object({
  customerType: z.enum(CUSTOMER_TYPES, {
    message: 'ประเภทลูกค้าต้องเป็น person, shop หรือ organization',
  }),
  name: z
    .string({ message: 'กรุณาระบุชื่อลูกค้า' })
    .trim()
    .min(1, 'กรุณาระบุชื่อลูกค้า')
    .max(200, 'ชื่อลูกค้ายาวเกินไป'),
  contactPerson: z.string().trim().max(150).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  taxId: z.string().trim().max(30).nullable().optional(),
  branchType: z.string().trim().max(80).nullable().optional(),
  zone: z.string().trim().max(120).nullable().optional(),
  houseNo: z.string().trim().max(80).nullable().optional(),
  moo: z.string().trim().max(60).nullable().optional(),
  subdistrict: z.string().trim().max(100).nullable().optional(),
  district: z.string().trim().max(100).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  priceTierId: z.coerce.number().int().positive().nullable().optional(),
  outstandingBottles: z.coerce.number().int().min(0).optional(),
  balanceSat: z.coerce.number().int().optional(),
  creditTermDays: z.coerce.number().int().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  prices: pricesMapSchema.optional(),
});

export const updateCustomerSchema = z
  .object({
    customerType: z.enum(CUSTOMER_TYPES).optional(),
    name: z.string().trim().min(1, 'กรุณาระบุชื่อลูกค้า').max(200).optional(),
    contactPerson: z.string().trim().max(150).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    taxId: z.string().trim().max(30).nullable().optional(),
    branchType: z.string().trim().max(80).nullable().optional(),
    zone: z.string().trim().max(120).nullable().optional(),
    houseNo: z.string().trim().max(80).nullable().optional(),
    moo: z.string().trim().max(60).nullable().optional(),
    subdistrict: z.string().trim().max(100).nullable().optional(),
    district: z.string().trim().max(100).nullable().optional(),
    province: z.string().trim().max(100).nullable().optional(),
    postalCode: z.string().trim().max(20).nullable().optional(),
    address: z.string().trim().max(400).nullable().optional(),
    lat: z.coerce.number().min(-90).max(90).nullable().optional(),
    lng: z.coerce.number().min(-180).max(180).nullable().optional(),
    priceTierId: z.coerce.number().int().positive().nullable().optional(),
    outstandingBottles: z.coerce.number().int().min(0).optional(),
    balanceSat: z.coerce.number().int().optional(),
    creditTermDays: z.coerce.number().int().min(0).max(365).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'ต้องระบุข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ',
  });

export const updateCustomerPricesSchema = z.object({
  prices: pricesMapSchema.refine((obj) => Object.keys(obj).length > 0, {
    message: 'ต้องระบุราคาอย่างน้อย 1 SKU ในรูปแบบ { prices: { sku: satang } }',
  }),
});

export const resolveGmapsUrlSchema = z.object({
  url: z
    .string({ message: 'กรุณาระบุลิงก์ Google Maps' })
    .trim()
    .url('รูปแบบ URL ไม่ถูกต้อง')
    .max(2000),
});
