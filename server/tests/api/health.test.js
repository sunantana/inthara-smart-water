import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { runMigrations } from '../../src/db/migrate.js';

const app = createApp();

beforeAll(() => {
  runMigrations();
});

describe('GET /api/health', () => {
  it('ตอบ ok พร้อมสถานะฐานข้อมูลที่ query จริง', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'connected' });
    expect(typeof res.body.timestamp).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });
});

describe('error handler กลาง', () => {
  it('endpoint ที่ไม่มีอยู่ตอบ 404 ตามรูปแบบใน 04', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      message: expect.stringContaining('/api/does-not-exist'),
    });
  });

  it('JSON ที่ผิดรูปแบบตอบ 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
