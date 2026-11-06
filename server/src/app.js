import express from 'express';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRouter from './modules/health/router.js';
import authRouter from './modules/auth/router.js';
import customersRouter from './modules/customers/router.js';
import priceTiersRouter from './modules/pricing/router.js';
import ordersRouter from './modules/orders/router.js';

/**
 * สร้าง express app (ไม่ listen) — แยกจาก index.js เพื่อให้ supertest เรียกใช้ได้
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));

  // request log (level debug → ไม่รบกวน production)
  app.use((req, res, next) => {
    req.log = logger;
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.debug(
        {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs: Number(durationMs.toFixed(1)),
        },
        'request',
      );
    });
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/price-tiers', priceTiersRouter);
  app.use('/api/orders', ordersRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
