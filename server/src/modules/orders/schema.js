import { z } from 'zod';

export const ORDER_STATUSES = /** @type {const} */ ([
  'draft',
  'confirmed',
  'delivered',
  'cancelled',
]);

export const PAYMENT_STATUSES = /** @type {const} */ (['paid', 'unpaid', 'partial']);

export const ORDER_SKUS = /** @type {const} */ ([
  'FG-189L',
  'FG-350ML',
  'FG-600ML',
  'FG-1500ML',
]);

const dateStringSchema = z
  .string({ message: 'กรุณาระบุวันที่ในรูปแบบ YYYY-MM-DD' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD');

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสออเดอร์ไม่ถูกต้อง'),
});

export const ordersQuerySchema = z.object({
  customerId: z.coerce.number().int().positive().optional(),
  zone: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  dateFrom: dateStringSchema.optional(),
  dateTo: dateStringSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z
    .enum(['id', 'code', 'delivery_date', 'total_sat', 'status', 'created_at'])
    .optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const routeSheetQuerySchema = z.object({
  date: dateStringSchema.optional(),
  zone: z.string().trim().max(120).optional(),
});

/**
 * รายการสินค้าในออเดอร์ — ยอมให้ body มี field แปลกปลอมเช่น unitPriceSat ติดมาได้โดยไม่พัง
 * แต่ชั้น service จะเพิกเฉยและดึงราคาจากทะเบียนลูกค้าเสมอ (SRS PRC-2, ORD-1)
 */
const orderItemInputSchema = z.object({
  sku: z.enum(ORDER_SKUS, {
    message: 'รหัสสินค้า (SKU) ต้องเป็น FG-189L, FG-350ML, FG-600ML หรือ FG-1500ML',
  }),
  qty: z.coerce
    .number({ message: 'จำนวนสินค้าต้องเป็นตัวเลข' })
    .int('จำนวนสินค้าต้องเป็นจำนวนเต็ม')
    .min(0, 'จำนวนสินค้าต้องไม่ติดลบ'),
});

export const createOrderSchema = z
  .object({
    customerId: z.coerce
      .number({ message: 'กรุณาเลือกลูกค้า' })
      .int()
      .positive('กรุณาเลือกลูกค้า'),
    deliveryDate: dateStringSchema,
    items: z
      .array(orderItemInputSchema, { message: 'กรุณาระบุรายการสินค้า' })
      .min(1, 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ'),
    paymentMode: z.enum(['cash', 'credit']).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    source: z.enum(['staff', 'portal']).optional(),
  })
  .refine(
    (val) => val.items.reduce((sum, item) => sum + Number(item.qty || 0), 0) > 0,
    {
      message: 'จำนวนสินค้าทั้งหมดรวมกันต้องมากกว่า 0',
      path: ['items'],
    },
  );

export const updateOrderSchema = z
  .object({
    customerId: z.coerce.number().int().positive().optional(),
    deliveryDate: dateStringSchema.optional(),
    items: z
      .array(orderItemInputSchema)
      .min(1, 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ')
      .optional(),
    status: z.enum(['draft', 'confirmed']).optional(),
    paymentMode: z.enum(['cash', 'credit']).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    source: z.enum(['staff', 'portal']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'ต้องระบุข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ',
  })
  .refine(
    (val) =>
      val.items === undefined ||
      val.items.reduce((sum, item) => sum + Number(item.qty || 0), 0) > 0,
    {
      message: 'จำนวนสินค้าทั้งหมดรวมกันต้องมากกว่า 0',
      path: ['items'],
    },
  );

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .optional()
  .default({});
