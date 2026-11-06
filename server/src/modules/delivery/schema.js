import { z } from 'zod';

export const PAYMENT_MODES = /** @type {const} */ (['cash', 'credit']);

export const checkinIdParamSchema = z.object({
  checkinId: z.coerce.number().int().positive('รหัสเช็คอินไม่ถูกต้อง'),
});

const nonNegativeInt = z.coerce
  .number()
  .int('จำนวนต้องเป็นจำนวนเต็ม')
  .min(0, 'จำนวนต้องไม่ติดลบ')
  .max(1_000_000_000, 'ค่าสูงเกินกำหนด');

const deliveredArrayItemSchema = z.object({
  sku: z.string().trim().min(1, 'กรุณาระบุรหัส SKU').max(64),
  qty: nonNegativeInt,
});

export const createCheckinSchema = z
  .object({
    orderId: z.coerce.number().int().positive('กรุณาระบุ orderId').optional(),
    order_id: z.coerce.number().int().positive('กรุณาระบุ order_id').optional(),
    customerId: z.coerce.number().int().positive().optional().nullable(),
    customer_id: z.coerce.number().int().positive().optional().nullable(),
    tripId: z.coerce.number().int().positive().optional().nullable(),
    trip_id: z.coerce.number().int().positive().optional().nullable(),
    delivered: z
      .union([
        z.record(
          z.string().trim().min(1),
          z
            .number({ invalid_type_error: 'จำนวนส่งต้องเป็นตัวเลข' })
            .int('จำนวนส่งต้องเป็นจำนวนเต็ม')
            .min(0, 'จำนวนส่งต้องไม่ติดลบ'),
        ),
        z.array(deliveredArrayItemSchema),
      ])
      .optional()
      .default({}),
    returned189L: nonNegativeInt.optional(),
    returned_189l: nonNegativeInt.optional(),
    paymentMode: z.enum(PAYMENT_MODES).optional(),
    payment_mode: z.enum(PAYMENT_MODES).optional(),
    moneyReceivedSat: nonNegativeInt.optional(),
    money_received_sat: nonNegativeInt.optional(),
    notes: z.string().trim().max(1000).optional().nullable().default(''),
  })
  .refine((data) => (data.orderId ?? data.order_id) !== undefined, {
    message: 'กรุณาระบุ orderId',
    path: ['orderId'],
  });

export const checkinsQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  driverId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  orderId: z.coerce.number().int().positive().optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional().or(z.literal('')),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});
