import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/auth.js';
import { ROLES, requireRole } from './middleware/rbac.js';
import healthRouter from './modules/health/router.js';
import authRouter from './modules/auth/router.js';
import customersRouter from './modules/customers/router.js';
import priceTiersRouter from './modules/pricing/router.js';
import ordersRouter from './modules/orders/router.js';
import checkinsRouter from './modules/delivery/router.js';
import inventoryRouter from './modules/inventory/router.js';
import billingRouter from './modules/billing/router.js';
import tmsRouter from './modules/tms/router.js';
import productionRouter from './modules/production/router.js';
import { machinesRouter, maintenanceRouter } from './modules/cmms/router.js';
import assetsRouter from './modules/assets/router.js';
import employeesRouter from './modules/employees/router.js';
import expensesRouter from './modules/expenses/router.js';
import portalRouter from './modules/portal/router.js';
import reportsRouter from './modules/reports/router.js';
import backupRouter from './modules/backup/router.js';
import { listVehicles } from './modules/tms/service.js';

/**
 * สร้าง express app (ไม่ listen) — แยกจาก index.js เพื่อให้ supertest เรียกใช้ได้
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // gzip compression สำหรับทุก response ที่ client รองรับ
  app.use(compression({ threshold: 0 }));

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
  app.use('/api/checkins', checkinsRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/tms', tmsRouter);
  app.use('/api/production', productionRouter);
  app.use('/api/machines', machinesRouter);
  app.use('/api/maintenance', maintenanceRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/employees', employeesRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/portal', portalRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/backup', backupRouter);

  // Read endpoint for vehicles needed by TMS
  app.get('/api/vehicles', requireAuth, requireRole(...ROLES), (_req, res, next) => {
    try {
      return res.json(listVehicles());
    } catch (error) {
      return next(error);
    }
  });

  // Production Web Static Serving & SPA Fallback
  const webDistDir = path.resolve(
    process.env.WEB_DIST_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
  );
  const indexHtmlPath = path.join(webDistDir, 'index.html');

  if (config.nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
    app.use(express.static(webDistDir));

    // SPA fallback: ทุก GET request ที่ไม่ใช่ /api/* ตอบ index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      if (fs.existsSync(indexHtmlPath)) {
        return res.sendFile(indexHtmlPath);
      }
      return next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
