import { z } from 'zod';

export const DEPOSIT_MOVEMENT_TYPES = /** @type {const} */ (['in', 'use', 'refund']);
export const RECEIPT_METHODS = /** @type {const} */ (['cash', 'transfer', 'deposit', 'other']);
export const AGING_FILTERS = /** @type {const} */ ([
  'unpaid30',
  'unpaid60',
  'unpaid90',
  '30',
  '60',
  '90',
  'all',
  '',
]);

const nonNegativeSatang = z.coerce
  .number({ invalid_type_error: 'จำนวนเงินต้องเป็นตัวเลขหน่วยสตางค์' })
  .int('จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์')
  .min(0, 'จำนวนเงินต้องไม่ติดลบ')
  .max(10_000_000_000, 'จำนวนเงินสูงเกินกำหนด');

const positiveSatang = z.coerce
  .number({ invalid_type_error: 'จำนวนเงินต้องเป็นตัวเลขหน่วยสตางค์' })
  .int('จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์')
  .min(1, 'จำนวนเงินต้องมากกว่า 0 สตางค์')
  .max(10_000_000_000, 'จำนวนเงินสูงเกินกำหนด');

export const customerDepositSchema = z
  .object({
    type: z.enum(DEPOSIT_MOVEMENT_TYPES, {
      message: 'ประเภทการทำรายการต้องเป็น in, use หรือ refund',
    }),
    amountSat: positiveSatang.optional(),
    amount_sat: positiveSatang.optional(),
    note: z.string().trim().max(500).optional().nullable().default(''),
  })
  .refine((data) => (data.amountSat ?? data.amount_sat) !== undefined, {
    message: 'กรุณาระบุจำนวนเงิน (amountSat)',
    path: ['amountSat'],
  });

export const billingUnpaidQuerySchema = z.object({
  zone: z.string().trim().max(120).optional().default(''),
  aging: z.enum(AGING_FILTERS).optional().default(''),
  customerId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});

export const billingSettleSchema = z
  .object({
    customerId: z.coerce.number().int().positive('กรุณาระบุรหัสลูกค้า').optional(),
    customer_id: z.coerce.number().int().positive('กรุณาระบุรหัสลูกค้า').optional(),
    amountSat: nonNegativeSatang.optional(),
    amount_sat: nonNegativeSatang.optional(),
    useDepositSat: nonNegativeSatang.optional(),
    use_deposit_sat: nonNegativeSatang.optional(),
    method: z.enum(RECEIPT_METHODS).optional().default('cash'),
    note: z.string().trim().max(500).optional().nullable().default(''),
  })
  .refine((data) => (data.customerId ?? data.customer_id) !== undefined, {
    message: 'กรุณาระบุรหัสลูกค้า (customerId)',
    path: ['customerId'],
  })
  .refine(
    (data) => {
      const amount = Number(data.amountSat ?? data.amount_sat ?? 0);
      const deposit = Number(data.useDepositSat ?? data.use_deposit_sat ?? 0);
      return amount + deposit > 0;
    },
    {
      message: 'จำนวนเงินที่ชำระรวมกับเงินมัดจำที่ใช้ต้องมากกว่า 0 สตางค์',
      path: ['amountSat'],
    },
  );

export const receiptIdParamSchema = z.object({
  receiptId: z.coerce.number().int().positive('รหัสใบเสร็จไม่ถูกต้อง'),
});

export const billingCustomerIdParamSchema = z.object({
  customerId: z.coerce.number().int().positive('รหัสลูกค้าไม่ถูกต้อง'),
});
