import pino from 'pino';
import { config } from '../config.js';

/**
 * logger กลางของระบบ — ห้าม log password / token / PIN
 * redact ไว้กันพลาด ถ้ามี object ที่มีฟิลด์เหล่านั้นหลุดเข้า log
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: 'inthara-server', env: config.nodeEnv },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.pin',
      '*.passwordHash',
      '*.password_hash',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
});

export default logger;
