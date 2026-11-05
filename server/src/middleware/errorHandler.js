import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** 404 สำหรับ endpoint ที่ไม่มีอยู่ — รูปแบบเดียวกับ error อื่นตาม 04 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `ไม่พบ endpoint ${req.method} ${req.originalUrl}`,
    },
  });
}

/**
 * error handler กลาง — แปลงทุก error เป็น JSON ตาม 04
 * ห้ามเปิดรายละเอียดของ 500 ออกไปให้ client เห็น
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ข้อมูลไม่ถูกต้อง',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          issue: issue.message,
        })),
      },
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'รูปแบบ JSON ไม่ถูกต้อง' },
    });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด' },
    });
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ' },
  });
}

export default { errorHandler, notFoundHandler };
