import { z } from 'zod';

export const INVENTORY_CATEGORIES = /** @type {const} */ ([
  'finished_goods',
  'empty_bottle',
  'raw_material',
  'spare_part',
  'packaging',
]);

export const MOVEMENT_REASONS = /** @type {const} */ ([
  'production_in',
  'order_out',
  'checkin_return',
  'packaging_in',
  'maintenance_use',
  'adjustment',
  'backup_restore',
]);

export const inventorySkuParamSchema = z.object({
  sku: z.string().trim().min(1, 'กรุณาระบุรหัส SKU').max(64),
});

export const inventoryItemsQuerySchema = z.object({
  category: z.enum(INVENTORY_CATEGORIES).optional().or(z.literal('')),
  lowStockOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
    .optional()
    .transform((val) => val === true || val === 'true' || val === '1'),
});

const nonNegativeInt = z.coerce
  .number()
  .int('ต้องเป็นจำนวนเต็ม')
  .min(0, 'ต้องไม่ติดลบ')
  .max(1_000_000_000, 'ค่าสูงเกินกำหนด');

export const updateInventoryItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    unit: z.string().trim().min(1).max(50).optional(),
    minStock: nonNegativeInt.optional(),
    min_stock: nonNegativeInt.optional(),
    unitCostSat: nonNegativeInt.optional(),
    unit_cost_sat: nonNegativeInt.optional(),
    unitPriceSat: nonNegativeInt.optional(),
    unit_price_sat: nonNegativeInt.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.unit !== undefined ||
      data.minStock !== undefined ||
      data.min_stock !== undefined ||
      data.unitCostSat !== undefined ||
      data.unit_cost_sat !== undefined ||
      data.unitPriceSat !== undefined ||
      data.unit_price_sat !== undefined,
    { message: 'กรุณาระบุข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ' },
  );

export const adjustInventorySchema = z.object({
  sku: z.string().trim().min(1, 'กรุณาระบุรหัส SKU').max(64),
  newStock: nonNegativeInt,
  reason: z.string().trim().max(300).optional().default('adjustment'),
  lotNo: z.string().trim().max(100).optional().nullable(),
});

export const inventoryMovementsQuerySchema = z.object({
  sku: z.string().trim().max(64).optional().default(''),
  reason: z.enum(MOVEMENT_REASONS).optional().or(z.literal('')),
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
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});
