import { z } from 'zod';

export const EXPENSE_CATEGORIES = ['fuel', 'repair', 'utility', 'packaging', 'salary', 'other'];

export const listExpensesQuerySchema = z.object({
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && EXPENSE_CATEGORIES.includes(v) ? v : undefined)),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom ต้องอยู่ในรูปแบบ YYYY-MM-DD')
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo ต้องอยู่ในรูปแบบ YYYY-MM-DD')
    .optional(),
  refType: z.string().trim().max(50).optional(),
  refId: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const createExpenseSchema = z.object({
  date: z
    .string({ required_error: 'กรุณาระบุวันที่ (date)' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ (date) ต้องอยู่ในรูปแบบ YYYY-MM-DD'),
  category: z.enum(EXPENSE_CATEGORIES, {
    errorMap: () => ({
      message: 'หมวดหมู่ค่าใช้จ่ายต้องเป็น fuel, repair, utility, packaging, salary หรือ other',
    }),
  }),
  refType: z.string().trim().max(50).optional().nullable(),
  refId: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  amountSat: z.coerce
    .number({ required_error: 'กรุณาระบุจำนวนเงิน (amountSat)' })
    .int('จำนวนเงิน (สตางค์) ต้องเป็นจำนวนเต็ม')
    .positive('จำนวนเงิน (amountSat) ต้องมากกว่า 0 สตางค์'),
});

export const tripCostingParamSchema = z.object({
  tripId: z.coerce.number().int().positive('tripId ต้องเป็นตัวเลขจำนวนเต็มบวก'),
});
