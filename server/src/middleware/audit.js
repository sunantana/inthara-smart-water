import { getDb } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/**
 * ใส่บริบทเพิ่มเติมให้ audit log ของคำขอนี้ (เรียกได้จาก route/service)
 * @param {import('express').Response} res
 * @param {{ entityId?: string|number, detail?: string }} context
 */
export function setAuditContext(res, context) {
  res.locals.audit = { ...(res.locals.audit || {}), ...context };
}

/**
 * middleware: บันทึก audit_logs ตาม 02 §5 (user, action, entity, entityId, ip, status)
 * - ข้าม method ที่อ่านอย่างเดียว (GET/HEAD/OPTIONS)
 * - บันทึกหลัง response ส่งเสร็จ เพื่อไม่ให้ audit ทำให้ request ช้า/ล้ม
 * - audit ล้มเหลวต้องไม่ทำให้ request ล้ม (log ไว้เท่านั้น)
 * ใช้: router.post('/', requireAuth, audit('ORDER_CREATE', 'orders'), handler)
 * @param {string} action
 * @param {string} [entity]
 */
export function audit(action, entity) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    res.on('finish', () => {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      try {
        getDb()
          .prepare(
            `INSERT INTO audit_logs (user_id, username, role, action, entity, entity_id, ip, status, detail)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            req.user?.id ?? req.user?.sub ?? null,
            req.user?.username ?? 'anonymous',
            req.user?.role ?? null,
            action,
            entity ?? null,
            String(res.locals.audit?.entityId ?? req.params?.id ?? '') || null,
            req.ip ?? null,
            success ? 'SUCCESS' : 'FAILED',
            res.locals.audit?.detail ?? null,
          );
      } catch (error) {
        logger.error({ err: error, action }, 'เขียน audit log ไม่สำเร็จ');
      }
    });

    return next();
  };
}

export default audit;
