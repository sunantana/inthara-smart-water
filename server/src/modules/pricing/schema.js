import { z } from 'zod';

const satangInt = z.coerce
  .number({ message: 'ราคาต้องเป็นตัวเลขหน่วยสตางค์' })
  .int('ราคาต้องเป็นจำนวนเต็มสตางค์ (satang integer)')
  .min(0, 'ราคาต้องไม่ติดลบ');

const pricesObjectSchema = z
  .object({
    'FG-189L': satangInt.optional(),
    'FG-350ML': satangInt.optional(),
    'FG-600ML': satangInt.optional(),
    'FG-1500ML': satangInt.optional(),
  })
  .optional();

export const priceTiersQuerySchema = z.object({
  active: z.enum(['0', '1', 'true', 'false', 'all']).optional(),
});

export const priceTierIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัส Price Tier ไม่ถูกต้อง'),
});

export const createPriceTierSchema = z
  .object({
    name: z
      .string({ message: 'กรุณาระบุชื่อระดับราคา (Price Tier)' })
      .trim()
      .min(1, 'กรุณาระบุชื่อระดับราคา')
      .max(120, 'ชื่อระดับราคายาวเกินไป'),
    price189lSat: satangInt.optional(),
    price350mlSat: satangInt.optional(),
    price600mlSat: satangInt.optional(),
    price1500mlSat: satangInt.optional(),
    prices: pricesObjectSchema,
    isActive: z.boolean().optional(),
  })
  .refine(
    (val) =>
      (val.price189lSat !== undefined &&
        val.price350mlSat !== undefined &&
        val.price600mlSat !== undefined &&
        val.price1500mlSat !== undefined) ||
      (val.prices?.['FG-189L'] !== undefined &&
        val.prices?.['FG-350ML'] !== undefined &&
        val.prices?.['FG-600ML'] !== undefined &&
        val.prices?.['FG-1500ML'] !== undefined),
    {
      message: 'กรุณาระบุราคาทั้ง 4 SKU (หน่วยสตางค์)',
    },
  );

export const updatePriceTierSchema = z
  .object({
    name: z.string().trim().min(1, 'กรุณาระบุชื่อระดับราคา').max(120).optional(),
    price189lSat: satangInt.optional(),
    price350mlSat: satangInt.optional(),
    price600mlSat: satangInt.optional(),
    price1500mlSat: satangInt.optional(),
    prices: pricesObjectSchema,
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'ต้องระบุข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ',
  });
