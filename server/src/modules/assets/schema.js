import { z } from 'zod';

export const ASSET_STATUSES = /** @type {const} */ (['in_use', 'maintenance', 'retired']);

export const assetIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสสินทรัพย์ (id) ต้องเป็นจำนวนเต็มบวก'),
});

const nonNegativeInt = z.coerce
  .number()
  .int('จำนวนเงินต้องเป็นจำนวนเต็มหน่วยสตางค์')
  .min(0, 'จำนวนเงินต้องไม่ติดลบ');

export const createAssetBodySchema = z.object({
  code: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1, 'กรุณาระบุชื่อสินทรัพย์ (name)').max(200),
  category: z.string().trim().max(100).optional().default('general'),
  categoryName: z.string().trim().max(150).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  serialNo: z.string().trim().max(100).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  acquisitionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ซื้อ (acquisitionDate) ต้องเป็น YYYY-MM-DD')
    .optional(),
  costSat: nonNegativeInt.default(0),
  usefulLifeYears: z.coerce.number().int().min(1).max(100).default(5),
  salvageValueSat: nonNegativeInt.default(0),
  assignedEmployeeId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(ASSET_STATUSES).optional().default('in_use'),
});

export const updateAssetBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional(),
  categoryName: z.string().trim().max(150).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  serialNo: z.string().trim().max(100).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  acquisitionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  costSat: nonNegativeInt.optional(),
  usefulLifeYears: z.coerce.number().int().min(1).max(100).optional(),
  salvageValueSat: nonNegativeInt.optional(),
  assignedEmployeeId: z.coerce.number().int().positive().nullable().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const assetDepreciationQuerySchema = z.object({
  asOf: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ (asOf) ต้องเป็น YYYY-MM-DD')
    .optional(),
});

export const listAssetsQuerySchema = z.object({
  category: z.string().trim().max(100).optional().default(''),
  status: z.enum(ASSET_STATUSES).optional().or(z.literal('')),
  includeRetired: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});
