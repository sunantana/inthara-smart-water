import { z } from 'zod';

export const MACHINE_STATUSES = /** @type {const} */ (['available', 'in_use', 'maintenance']);
export const MAINTENANCE_TYPES = /** @type {const} */ (['repair', 'pm', 'inspection']);

export const machineCodeParamSchema = z.object({
  code: z.string().trim().min(1, 'กรุณาระบุรหัสเครื่องจักร (code)').max(64),
});

export const updateMachineStatusBodySchema = z.object({
  status: z.enum(['available', 'maintenance'], {
    errorMap: () => ({
      message: 'อนุญาตให้เปลี่ยนสถานะเครื่องจักรเฉพาะ available ↔ maintenance เท่านั้น',
    }),
  }),
});

export const updateMachineRunHoursBodySchema = z.object({
  runHours: z.coerce.number().min(0, 'ชั่วโมงการทำงานต้องไม่ติดลบ'),
  pmIntervalHours: z.coerce.number().positive().optional(),
});

export const createMaintenanceLogBodySchema = z.object({
  machineCode: z.string().trim().min(1, 'กรุณาระบุรหัสเครื่องจักร (machineCode)').max(64),
  performedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ซ่อมบำรุง (performedDate) ต้องเป็น YYYY-MM-DD')
    .optional(),
  type: z.enum(MAINTENANCE_TYPES, {
    errorMap: () => ({ message: 'ประเภทงานซ่อมต้องเป็น repair, pm หรือ inspection' }),
  }),
  action: z.string().trim().min(1, 'กรุณาระบุรายละเอียดการซ่อม/บำรุงรักษา (action)').max(500),
  technician: z.string().trim().max(150).nullable().optional(),
  costSat: z.coerce.number().int().min(0, 'ค่าใช้จ่ายต้องไม่ติดลบ').default(0),
  spareSku: z.string().trim().max(64).nullable().optional(),
  spareQty: z.coerce.number().int().min(0).nullable().optional(),
});

export const listMaintenanceLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  machineCode: z.string().trim().max(64).optional().default(''),
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
