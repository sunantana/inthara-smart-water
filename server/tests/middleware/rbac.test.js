import { describe, expect, it, vi } from 'vitest';
import { isManagerOrAdmin, ROLES, requireRole } from '../../src/middleware/rbac.js';
import { AppError } from '../../src/utils/errors.js';

describe('middleware/rbac', () => {
  it('มีรายการ ROLES ครบ 4 บทบาทตาม 03_DB_Schema', () => {
    expect(ROLES).toEqual(['admin', 'manager', 'staff', 'driver']);
  });

  it('โยน Error ทันทีถ้าตั้งค่า requireRole โดยไม่ระบุ role หรือระบุ role ที่ไม่มีในระบบ', () => {
    expect(() => requireRole()).toThrow(/ระบุบทบาทไม่ถูกต้อง/);
    expect(() => requireRole('superadmin')).toThrow(/superadmin/);
  });

  it('ตอบ 401 UNAUTHORIZED เมื่อไม่มี req.user', () => {
    const mw = requireRole('admin');
    const next = vi.fn();
    mw({}, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('ตอบ 403 FORBIDDEN เมื่อบทบาทของ req.user ไม่อยู่ในรายการที่อนุญาต', () => {
    const mw = requireRole('admin', 'manager');
    const next = vi.fn();
    mw({ user: { id: 2, username: 'staff01', role: 'staff' } }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('ปล่อยผ่าน (next()) เมื่อบทบาทของ req.user ตรงกับที่อนุญาต (ทั้งแบบรายตัวและ array)', () => {
    const mw1 = requireRole('admin', 'manager');
    const next1 = vi.fn();
    mw1({ user: { id: 1, username: 'mgr01', role: 'manager' } }, {}, next1);
    expect(next1).toHaveBeenCalledWith();

    const mw2 = requireRole(['staff', 'driver']);
    const next2 = vi.fn();
    mw2({ user: { id: 3, username: 'drv01', role: 'driver' } }, {}, next2);
    expect(next2).toHaveBeenCalledWith();
  });

  it('isManagerOrAdmin คืนค่าถูกต้องตามบทบาท', () => {
    expect(isManagerOrAdmin({ role: 'admin' })).toBe(true);
    expect(isManagerOrAdmin({ role: 'manager' })).toBe(true);
    expect(isManagerOrAdmin({ role: 'staff' })).toBe(false);
    expect(isManagerOrAdmin({ role: 'driver' })).toBe(false);
    expect(isManagerOrAdmin(null)).toBe(false);
    expect(isManagerOrAdmin(undefined)).toBe(false);
  });
});
