import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedInitialUsers } from '../../scripts/seed-admin.mjs';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { REFRESH_COOKIE_NAME, resetLoginRateLimiter } from '../../src/modules/auth/router.js';
import { hashSecret, resetAuthMemoryState } from '../../src/modules/auth/service.js';

const app = createApp();

const TEST_ACCOUNTS = {
  admin: {
    username: 'admin',
    password: 'AdminTestPassword123!',
    pin: '111111',
    displayName: 'ผู้ดูแลระบบทดสอบ',
    role: 'admin',
  },
  manager: {
    username: 'manager',
    password: 'ManagerTestPassword123!',
    pin: '222222',
    displayName: 'ผู้จัดการทดสอบ',
    role: 'manager',
  },
  staff: {
    username: 'staff',
    password: 'StaffTestPassword123!',
    pin: '333333',
    displayName: 'พนักงานสำนักงานทดสอบ',
    role: 'staff',
  },
};

function getCookieHeader(res, cookieName = REFRESH_COOKIE_NAME) {
  const cookies = res.headers['set-cookie'];
  if (!cookies) return null;
  const list = Array.isArray(cookies) ? cookies : [cookies];
  const matched = list.find((c) => c.startsWith(`${cookieName}=`));
  return matched ? matched.split(';')[0] : null;
}

function seedFixedTestUsers() {
  const db = getDb();
  db.exec('DELETE FROM audit_logs; DELETE FROM users;');

  const stmt = db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash, pin, is_active)
    VALUES (@username, @displayName, @role, @passwordHash, @pinHash, 1)
  `);

  for (const acc of Object.values(TEST_ACCOUNTS)) {
    stmt.run({
      username: acc.username,
      displayName: acc.displayName,
      role: acc.role,
      passwordHash: hashSecret(acc.password),
      pinHash: hashSecret(acc.pin),
    });
  }
}

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  resetLoginRateLimiter();
  resetAuthMemoryState();
  seedFixedTestUsers();
});

describe('Phase 1 — Auth + RBAC + Audit Integration Tests', () => {
  describe('1) POST /api/auth/login & การล็อกบัญชี 5 ครั้ง / 15 นาที', () => {
    it('ล็อกอินสำเร็จด้วยรหัสผ่านที่ถูกต้อง คืน accessToken, user และตั้ง httpOnly refreshToken cookie', async () => {
      const res = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.admin.username,
        password: TEST_ACCOUNTS.admin.password,
      });

      expect(res.status).toBe(200);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toMatchObject({
        username: 'admin',
        displayName: TEST_ACCOUNTS.admin.displayName,
        role: 'admin',
      });
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body.user).not.toHaveProperty('pin');

      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie.join(';')).toContain(`${REFRESH_COOKIE_NAME}=`);
      expect(setCookie.join(';')).toContain('HttpOnly');
    });

    it('ล็อกอินผิด 5 ครั้ง → ครั้งที่ 6 ได้ 409 พร้อม lockMinutes (ทดสอบด้วย username ปลอมเท่านั้น)', async () => {
      const fakeUsername = 'ghost_intruder_test_99';

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', '10.10.1.50')
          .send({
            username: fakeUsername,
            password: `WrongPass_${attempt}`,
          });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }

      const sixthRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.10.1.50')
        .send({
          username: fakeUsername,
          password: 'WrongPass_6',
        });

      expect(sixthRes.status).toBe(409);
      expect(sixthRes.body.error.code).toBe('CONFLICT');
      expect(sixthRes.body.error.lockMinutes).toBeGreaterThanOrEqual(1);
      expect(sixthRes.body.error.lockMinutes).toBeLessThanOrEqual(15);
    });

    it('ล็อกบัญชีในฐานข้อมูลจริงเมื่อใส่รหัสผิดครบ 5 ครั้ง และปลดล็อกได้ด้วย POST /api/auth/users/:id/unlock', async () => {
      const createRes = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.admin.username,
        password: TEST_ACCOUNTS.admin.password,
      });
      const adminToken = createRes.body.accessToken;

      const newUserRes = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'temp_lock_target',
          displayName: 'เป้าหมายทดสอบล็อก',
          role: 'staff',
          password: 'CorrectPassword999',
          pin: '654321',
        });
      expect(newUserRes.status).toBe(201);
      const targetUserId = newUserRes.body.user.id;

      for (let i = 1; i <= 5; i += 1) {
        const failRes = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', `10.20.0.${i}`)
          .send({
            username: 'temp_lock_target',
            password: 'WrongPassword000',
          });
        expect(failRes.status).toBe(401);
      }

      const lockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.20.0.99')
        .send({
          username: 'temp_lock_target',
          password: 'CorrectPassword999',
        });
      expect(lockedRes.status).toBe(409);
      expect(lockedRes.body.error.lockMinutes).toBe(15);

      const unlockRes = await request(app)
        .post(`/api/auth/users/${targetUserId}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.user.failedAttempts).toBe(0);
      expect(unlockRes.body.user.lockUntil).toBeNull();

      const afterUnlockRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.20.0.100')
        .send({
          username: 'temp_lock_target',
          password: 'CorrectPassword999',
        });
      expect(afterUnlockRes.status).toBe(200);
    });
  });

  describe('2) Rate Limit 10 req/min/IP บน POST /api/auth/login', () => {
    it('ยิง login 10 ครั้งใน 1 นาทีจาก IP เดียวกันผ่านเข้า handler ได้ แต่ครั้งที่ 11 ได้ 429 RATE_LIMITED', async () => {
      const testIp = '192.168.88.77';

      for (let i = 1; i <= 10; i += 1) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', testIp)
          .send({
            username: `fake_rate_user_${i}`,
            password: 'WrongPassword123',
          });

        expect(res.status).toBe(401);
      }

      const eleventhRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({
          username: 'fake_rate_user_11',
          password: 'WrongPassword123',
        });

      expect(eleventhRes.status).toBe(429);
      expect(eleventhRes.body.error).toMatchObject({
        code: 'RATE_LIMITED',
      });
    });
  });

  describe('3) การตรวจสอบ Access Token (ปลอม / หมดอายุ / ผิด scope)', () => {
    it('ไม่มี Authorization header → ตอบ 401 UNAUTHORIZED ตามรูปแบบ 04_API_Spec', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: expect.any(String),
        },
      });
    });

    it('Token ปลอมหรือลายเซ็นไม่ตรง → ตอบ 401 UNAUTHORIZED', async () => {
      const fakeToken = jwt.sign(
        { sub: 1, username: 'admin', role: 'admin' },
        'wrong-secret-key-not-matching',
        { expiresIn: '15m' },
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('Token หมดอายุ → ตอบ 401 TOKEN_EXPIRED ตามรูปแบบ 04_API_Spec', async () => {
      const expiredToken = jwt.sign(
        { sub: 1, id: 1, username: 'admin', role: 'admin' },
        config.jwt.secret,
        { expiresIn: -10 },
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('Token สำหรับ Portal (scope: portal) เรียกใช้งานฝั่ง ERP → ตอบ 403 FORBIDDEN', async () => {
      const portalToken = jwt.sign(
        { sub: 99, customerId: 99, scope: 'portal' },
        config.jwt.secret,
        { expiresIn: '15m' },
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${portalToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4) POST /api/auth/refresh & POST /api/auth/logout (Token Rotation & Revocation)', () => {
    it('Refresh หมุน token ใหม่ทุกครั้ง (ใบเก่าใช้ซ้ำไม่ได้) และ Logout เพิกถอน refresh token ทันที', async () => {
      const loginRes = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.admin.username,
        password: TEST_ACCOUNTS.admin.password,
      });
      expect(loginRes.status).toBe(200);

      const firstCookie = getCookieHeader(loginRes);
      expect(firstCookie).toBeTruthy();

      // หมุนรอบที่ 1 ด้วย cookie แรก → สำเร็จ และได้ cookie ใบที่ 2
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', firstCookie);

      expect(refreshRes.status).toBe(200);
      expect(typeof refreshRes.body.accessToken).toBe('string');
      const secondCookie = getCookieHeader(refreshRes);
      expect(secondCookie).toBeTruthy();
      expect(secondCookie).not.toBe(firstCookie);

      // นำ cookie ใบที่ 1 กลับมาใช้ซ้ำ → ต้องได้ 401 เพราะถูกหมุนทิ้งไปแล้ว
      const reuseOldRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', firstCookie);
      expect(reuseOldRes.status).toBe(401);

      // Logout ด้วย cookie ใบที่ 2 → สำเร็จ
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
        .set('Cookie', secondCookie);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.ok).toBe(true);

      // นำ cookie ใบที่ 2 มาเรียก /refresh หลัง logout → ต้องใช้ต่อไม่ได้ (401)
      const afterLogoutRefresh = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', secondCookie);
      expect(afterLogoutRefresh.status).toBe(401);
    });
  });

  describe('5) RBAC & การจัดการผู้ใช้ (/api/auth/users) และเปลี่ยนรหัสผ่านด้วย PIN (AUTH-3)', () => {
    it('ผู้ใช้บทบาท staff เรียก GET /api/auth/users → ได้ 403 FORBIDDEN, ส่วน admin → ได้ 200 OK', async () => {
      const staffLogin = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.staff.username,
        password: TEST_ACCOUNTS.staff.password,
      });
      const staffToken = staffLogin.body.accessToken;

      const staffRes = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(staffRes.status).toBe(403);
      expect(staffRes.body.error.code).toBe('FORBIDDEN');

      const adminLogin = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.admin.username,
        password: TEST_ACCOUNTS.admin.password,
      });
      const adminToken = adminLogin.body.accessToken;

      const adminRes = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(Array.isArray(adminRes.body.data)).toBe(true);
      expect(adminRes.body.data.length).toBeGreaterThanOrEqual(3);
      expect(adminRes.body.pagination).toMatchObject({
        page: 1,
        total: expect.any(Number),
      });

      for (const u of adminRes.body.data) {
        expect(u).not.toHaveProperty('password_hash');
        expect(u).not.toHaveProperty('pin');
      }
    });

    it('admin สร้างผู้ใช้ใหม่ (POST /api/auth/users) และแก้ไขผู้ใช้ (PUT /api/auth/users/:id) ได้', async () => {
      const adminLogin = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.admin.username,
        password: TEST_ACCOUNTS.admin.password,
      });
      const adminToken = adminLogin.body.accessToken;

      const createRes = await request(app)
        .post('/api/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'driver_01',
          displayName: 'สมชาย สายส่ง',
          role: 'driver',
          password: 'DriverPassword123!',
          pin: '998877',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.user).toMatchObject({
        username: 'driver_01',
        displayName: 'สมชาย สายส่ง',
        role: 'driver',
        isActive: true,
        hasPin: true,
      });

      const userId = createRes.body.user.id;

      const updateRes = await request(app)
        .put(`/api/auth/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          displayName: 'สมชาย สายส่ง (หัวหน้าสาย)',
          isActive: false,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.user).toMatchObject({
        id: userId,
        displayName: 'สมชาย สายส่ง (หัวหน้าสาย)',
        isActive: false,
      });
    });

    it('POST /api/auth/change-password ตรวจ PIN ก่อนเปลี่ยนรหัสผ่าน (AUTH-3)', async () => {
      const staffLogin = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.staff.username,
        password: TEST_ACCOUNTS.staff.password,
      });
      const staffToken = staffLogin.body.accessToken;

      // PIN ผิด → 401
      const wrongPinRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          oldPassword: TEST_ACCOUNTS.staff.password,
          pin: '000000',
          newPassword: 'NewStaffPassword456!',
        });
      expect(wrongPinRes.status).toBe(401);

      // PIN ถูก + รหัสเดิมถูก → 200 และล็อกอินด้วยรหัสใหม่ได้
      const okRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          oldPassword: TEST_ACCOUNTS.staff.password,
          pin: TEST_ACCOUNTS.staff.pin,
          newPassword: 'NewStaffPassword456!',
        });
      expect(okRes.status).toBe(200);
      expect(okRes.body.ok).toBe(true);

      const reloginRes = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.staff.username,
        password: 'NewStaffPassword456!',
      });
      expect(reloginRes.status).toBe(200);
    });
  });

  describe('6) GET /api/auth/audit-logs & Seed Script', () => {
    it('บันทึก Audit Log อัตโนมัติและกรองตาม username, action, from, to พร้อม pagination ได้', async () => {
      const adminLogin = await request(app).post('/api/auth/login').send({
        username: TEST_ACCOUNTS.admin.username,
        password: TEST_ACCOUNTS.admin.password,
      });
      const adminToken = adminLogin.body.accessToken;

      const logsRes = await request(app)
        .get('/api/auth/audit-logs')
        .query({ username: 'admin', action: 'LOGIN_SUCCESS', page: 1, limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(logsRes.status).toBe(200);
      expect(logsRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(logsRes.body.data[0]).toMatchObject({
        username: 'admin',
        action: 'LOGIN_SUCCESS',
        entity: 'auth',
      });
      expect(logsRes.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
      });
    });

    it('seedInitialUsers สร้างบัญชี admin และบทบาททดสอบครบ 5 บทบาทด้วย bcrypt hash', () => {
      const db = getDb();
      db.exec('DELETE FROM users;');

      const results = seedInitialUsers({
        adminPassword: 'SeedAdminPassword999!',
        adminPin: '123456',
      });

      expect(results).toHaveLength(5);
      const count = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
      expect(count).toBe(5);
    });
  });
});
