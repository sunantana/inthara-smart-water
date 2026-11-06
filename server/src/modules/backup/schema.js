import { z } from 'zod';

export const restoreBackupSchema = z.object({
  filename: z
    .string({ required_error: 'กรุณาระบุชื่อไฟล์สำรองที่ต้องการคืนค่า' })
    .trim()
    .min(1, 'กรุณาระบุชื่อไฟล์สำรอง'),
  adminPassword: z
    .string({ required_error: 'กรุณาระบุรหัสผ่าน Admin เพื่อยืนยันการคืนค่าฐานข้อมูล' })
    .trim()
    .min(1, 'กรุณาระบุรหัสผ่าน Admin'),
});
