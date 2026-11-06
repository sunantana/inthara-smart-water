import { z } from 'zod';

export const ORDER_SKUS = /** @type {const} */ ([
  'FG-189L',
  'FG-350ML',
  'FG-600ML',
  'FG-1500ML',
]);

export const portalLoginBodySchema = z.object({
  customerCode: z
    .string({ required_error: 'กรุณาระบุรหัสลูกค้า (customerCode)' })
    .trim()
    .min(1, 'กรุณาระบุรหัสลูกค้า'),
  pin: z
    .string({ required_error: 'กรุณาระบุรหัส PIN' })
    .trim()
    .regex(/^\d{4,6}$/, 'รหัส PIN ต้องเป็นตัวเลข 4–6 หลัก'),
});

const portalOrderItemInputSchema = z.object({
  sku: z.enum(ORDER_SKUS, {
    message: 'รหัสสินค้า (SKU) ต้องเป็น FG-189L, FG-350ML, FG-600ML หรือ FG-1500ML',
  }),
  qty: z.coerce
    .number({ message: 'จำนวนสินค้าต้องเป็นตัวเลข' })
    .int('จำนวนสินค้าต้องเป็นจำนวนเต็ม')
    .min(0, 'จำนวนสินค้าต้องไม่ติดลบ'),
});

export const portalCreateOrderSchema = z
  .object({
    deliveryDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD')
      .optional(),
    items: z
      .array(portalOrderItemInputSchema, { message: 'กรุณาระบุรายการสินค้า' })
      .min(1, 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ'),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (val) => val.items.reduce((sum, item) => sum + Number(item.qty || 0), 0) > 0,
    {
      message: 'จำนวนสินค้าทั้งหมดรวมกันต้องมากกว่า 0',
      path: ['items'],
    },
  );

export const portalOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminPortalPinBodySchema = z.object({
  pin: z
    .string({ required_error: 'กรุณาระบุรหัส PIN' })
    .trim()
    .regex(/^\d{4,6}$/, 'รหัส PIN ต้องเป็นตัวเลข 4–6 หลัก'),
});

export const customerIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสลูกค้าไม่ถูกต้อง'),
});
