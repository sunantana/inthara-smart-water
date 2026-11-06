import { z } from 'zod';

export const PRODUCTION_SHIFTS = /** @type {const} */ (['day', 'night']);
export const FG_SKUS = /** @type {const} */ (['FG-189L', 'FG-350ML', 'FG-600ML', 'FG-1500ML']);

const nonNegativeInt = z.coerce
  .number()
  .int('จำนวนผลิตต้องเป็นจำนวนเต็ม')
  .min(0, 'จำนวนผลิตต้องไม่ติดลบ')
  .max(1_000_000, 'จำนวนผลิตสูงเกินกำหนด');

export const productionLotIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสล็อตผลิต (id) ต้องเป็นจำนวนเต็มบวก'),
});

const skuQtyMapSchema = z
  .object({
    'FG-189L': nonNegativeInt.optional().default(0),
    'FG-350ML': nonNegativeInt.optional().default(0),
    'FG-600ML': nonNegativeInt.optional().default(0),
    'FG-1500ML': nonNegativeInt.optional().default(0),
  })
  .passthrough();

export const createProductionLotSchema = z.object({
  productionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ผลิต (productionDate) ต้องเป็น YYYY-MM-DD')
    .optional(),
  shift: z
    .enum(['day', 'night', 'D', 'N'])
    .transform((val) => (val === 'D' ? 'day' : val === 'N' ? 'night' : val))
    .default('day'),
  plan: skuQtyMapSchema.default({}),
  actual: skuQtyMapSchema.default({}),
  tdsRaw: z.coerce.number().min(0).max(10_000).nullable().optional(),
  tdsRo: z.coerce.number().min(0).max(10_000).nullable().optional(),
  ph: z.coerce.number().min(0).max(14).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const packagingConsumptionOverrideSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  qty: z.coerce.number().int().min(1),
});

export const evaluateProductionLotQaSchema = z.object({
  passed: z.boolean({ required_error: 'กรุณาระบุผลตรวจรับ QA (passed: true/false)' }),
  tdsRaw: z.coerce.number().min(0).max(10_000).nullable().optional(),
  tdsRo: z.coerce.number().min(0).max(10_000).nullable().optional(),
  ph: z.coerce.number().min(0).max(14).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  packagingConsumptions: z.array(packagingConsumptionOverrideSchema).optional(),
});

export const listProductionLotsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  shift: z
    .enum(['day', 'night', 'D', 'N', ''])
    .optional()
    .transform((val) => (val === 'D' ? 'day' : val === 'N' ? 'night' : val || '')),
});

export const productionDashboardQuerySchema = z.object({
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
});
