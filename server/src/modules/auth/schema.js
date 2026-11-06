import { z } from 'zod';
import { ROLES } from '../../middleware/rbac.js';

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'กรุณาระบุชื่อผู้ใช้'),
  password: z.string().min(1, 'กรุณาระบุรหัสผ่าน'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'กรุณาระบุรหัสผ่านเดิม'),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, 'รหัส PIN ต้องเป็นตัวเลข 4–6 หลัก'),
  newPassword: z
    .string()
    .min(8, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร')
    .max(128, 'รหัสผ่านใหม่ยาวเกินกำหนด'),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร')
    .max(50, 'ชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9 และ _ . -'),
  displayName: z
    .string()
    .trim()
    .min(1, 'กรุณาระบุชื่อที่แสดง')
    .max(100, 'ชื่อที่แสดงต้องไม่เกิน 100 ตัวอักษร'),
  role: z.enum(ROLES, { message: 'บทบาทผู้ใช้ไม่ถูกต้อง' }),
  password: z
    .string()
    .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .max(128, 'รหัสผ่านยาวเกินกำหนด'),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, 'รหัส PIN ต้องเป็นตัวเลข 4–6 หลัก')
    .optional(),
  employeeId: z.number().int().positive().nullable().optional(),
});

export const updateUserSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'กรุณาระบุชื่อที่แสดง')
      .max(100, 'ชื่อที่แสดงต้องไม่เกิน 100 ตัวอักษร')
      .optional(),
    role: z.enum(ROLES, { message: 'บทบาทผู้ใช้ไม่ถูกต้อง' }).optional(),
    isActive: z.boolean().optional(),
    pin: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, 'รหัส PIN ต้องเป็นตัวเลข 4–6 หลัก')
      .optional(),
    password: z
      .string()
      .min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      .max(128, 'รหัสผ่านยาวเกินกำหนด')
      .optional(),
    employeeId: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'กรุณาระบุข้อมูลที่ต้องการแก้ไขอย่างน้อย 1 รายการ',
  });

export const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสผู้ใช้ไม่ถูกต้อง'),
});

export const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: z.enum(ROLES).optional(),
  active: z.enum(['0', '1', 'true', 'false']).optional(),
  search: z.string().trim().optional(),
});

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  username: z.string().trim().optional(),
  action: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

export default {
  loginSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  usersQuerySchema,
  auditLogsQuerySchema,
};
