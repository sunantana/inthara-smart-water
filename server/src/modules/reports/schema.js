import { z } from 'zod';

export const salesReportQuerySchema = z.object({
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
  zone: z.string().trim().max(120).optional(),
  groupBy: z.enum(['day', 'month']).default('day'),
});
