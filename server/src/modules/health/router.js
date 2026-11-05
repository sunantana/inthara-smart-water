import { Router } from 'express';
import { ping } from './repo.js';

const router = Router();

/**
 * GET /api/health
 * ตอบ { status, timestamp, database } — database มาจากการ query SQLite จริง
 */
router.get('/', (_req, res) => {
  const timestamp = new Date().toISOString();

  let connected = false;
  try {
    connected = ping();
  } catch {
    connected = false;
  }

  if (!connected) {
    return res.status(503).json({ status: 'error', timestamp, database: 'disconnected' });
  }

  return res.json({ status: 'ok', timestamp, database: 'connected' });
});

export default router;
