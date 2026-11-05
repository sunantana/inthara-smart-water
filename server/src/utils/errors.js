/**
 * Error ที่ตั้งใจโยนจาก service/route — errorHandler กลางจะแปลงเป็น JSON
 * ตามรูปแบบใน 04_API_Spec: { error: { code, message, details? } }
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code รหัสตาม 04 (VALIDATION_ERROR, UNAUTHORIZED, ...)
   * @param {string} message ข้อความภาษาไทยที่แสดงต่อผู้ใช้
   * @param {Array<{field?: string, issue: string}>} [details]
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, details) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'กรุณาเข้าสู่ระบบ') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static tokenExpired(message = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่') {
    return new AppError(401, 'TOKEN_EXPIRED', message);
  }

  static forbidden(message = 'สิทธิ์ไม่เพียงพอสำหรับการกระทำนี้') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'ไม่พบข้อมูลที่ต้องการ') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message, details) {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static accountLocked(
    lockMinutes,
    message = `บัญชีถูกระงับชั่วคราวเนื่องจากใส่รหัสผ่านผิดเกินกำหนด กรุณารออีก ${lockMinutes} นาที`,
  ) {
    const err = new AppError(409, 'CONFLICT', message);
    err.lockMinutes = lockMinutes;
    return err;
  }

  static tooManyRequests(message = 'เรียกใช้งานถี่เกินไป กรุณาลองใหม่ภายหลัง') {
    return new AppError(429, 'RATE_LIMITED', message);
  }
}

export default AppError;
