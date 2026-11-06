import { z } from 'zod';

export const SALARY_TYPES = /** @type {const} */ (['monthly', 'daily', 'hourly']);

export const employeeIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสพนักงาน (id) ต้องเป็นจำนวนเต็มบวก'),
});

export const createEmployeeBodySchema = z.object({
  code: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1, 'กรุณาระบุชื่อ-นามสกุลพนักงาน').max(150),
  nickname: z.string().trim().max(80).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  position: z.string().trim().max(100).nullable().optional(),
  department: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  idCard: z.string().trim().max(30).nullable().optional(),
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  salaryType: z.enum(SALARY_TYPES).nullable().optional().default('monthly'),
  salarySat: z.coerce.number().int().min(0).nullable().optional().default(0),
  driverLicense: z.string().trim().max(80).nullable().optional(),
  driverLicenseExpiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันหมดอายุใบขับขี่ (driverLicenseExpiry) ต้องเป็น YYYY-MM-DD')
    .nullable()
    .optional(),
  username: z.string().trim().max(80).nullable().optional(),
  isActive: z.coerce.boolean().optional().default(true),
});

export const updateEmployeeBodySchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  nickname: z.string().trim().max(80).nullable().optional(),
  gender: z.string().trim().max(30).nullable().optional(),
  position: z.string().trim().max(100).nullable().optional(),
  department: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  idCard: z.string().trim().max(30).nullable().optional(),
  startDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  salaryType: z.enum(SALARY_TYPES).nullable().optional(),
  salarySat: z.coerce.number().int().min(0).nullable().optional(),
  driverLicense: z.string().trim().max(80).nullable().optional(),
  driverLicenseExpiry: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  username: z.string().trim().max(80).nullable().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const licenseExpiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  asOf: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const listEmployeesQuerySchema = z.object({
  active: z.enum(['0', '1', 'true', 'false', 'all']).optional(),
  department: z.string().trim().max(100).optional().default(''),
});
