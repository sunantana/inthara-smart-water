import { describe, expect, it } from 'vitest';
import { bahtToSatang, formatBaht, satangToBaht } from '../../src/utils/money.js';

describe('bahtToSatang', () => {
  it('แปลงค่าปกติได้', () => {
    expect(bahtToSatang(150)).toBe(15_000);
    expect(bahtToSatang('150')).toBe(15_000);
    expect(bahtToSatang(99.99)).toBe(9_999);
    expect(bahtToSatang(0.5)).toBe(50);
    expect(bahtToSatang(999_999_999.99)).toBe(99_999_999_999);
  });

  it('รองรับศูนย์', () => {
    expect(bahtToSatang(0)).toBe(0);
    expect(bahtToSatang('0')).toBe(0);
    expect(bahtToSatang('0.00')).toBe(0);
    expect(bahtToSatang('-0')).toBe(0);
    expect(bahtToSatang(-0.001)).toBe(0);
    expect(Object.is(bahtToSatang(-0.001), -0)).toBe(false);
  });

  it('รองรับค่าลบ', () => {
    expect(bahtToSatang(-12.5)).toBe(-1_250);
    expect(bahtToSatang('-0.01')).toBe(-1);
    expect(bahtToSatang('-1,234.56')).toBe(-123_456);
  });

  it('ทศนิยมเกิน 2 ตำแหน่ง: ปัดครึ่งขึ้น (half-up) ออกจากศูนย์', () => {
    expect(bahtToSatang('1.005')).toBe(101);
    expect(bahtToSatang(1.005)).toBe(101);
    expect(bahtToSatang('-1.005')).toBe(-101);
    expect(bahtToSatang('0.994')).toBe(99);
    expect(bahtToSatang('0.995')).toBe(100);
    expect(bahtToSatang('1.999')).toBe(200);
    expect(bahtToSatang('0.004')).toBe(0);
    expect(bahtToSatang('12,345.678')).toBe(1_234_568);
  });

  it('ไม่เพี้ยนเพราะ floating point', () => {
    expect(bahtToSatang(0.1 + 0.2)).toBe(30);
    expect(bahtToSatang(0.1 + 0.2)).toBe(bahtToSatang('0.30'));
    expect(bahtToSatang(1.1 * 3)).toBe(330);
    expect(bahtToSatang(0.29 * 100)).toBe(2_900);
    expect(bahtToSatang(4.35 * 100)).toBe(43_500);
  });

  it('ตัดช่องว่างและตัวคั่นหลักพันได้', () => {
    expect(bahtToSatang('  1,234.50  ')).toBe(123_450);
  });

  it('โยน TypeError เมื่อค่าผิดรูปแบบ', () => {
    expect(() => bahtToSatang(Number.NaN)).toThrow(TypeError);
    expect(() => bahtToSatang(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => bahtToSatang(Number.NEGATIVE_INFINITY)).toThrow(TypeError);
    expect(() => bahtToSatang('abc')).toThrow(TypeError);
    expect(() => bahtToSatang('')).toThrow(TypeError);
    expect(() => bahtToSatang('   ')).toThrow(TypeError);
    expect(() => bahtToSatang('1.2.3')).toThrow(TypeError);
    expect(() => bahtToSatang('1e3')).toThrow(TypeError);
    expect(() => bahtToSatang('.5')).toThrow(TypeError);
    expect(() => bahtToSatang('5.')).not.toThrow();
    expect(() => bahtToSatang(null)).toThrow(TypeError);
    expect(() => bahtToSatang(undefined)).toThrow(TypeError);
    expect(() => bahtToSatang(true)).toThrow(TypeError);
    expect(() => bahtToSatang({})).toThrow(TypeError);
  });
});

describe('satangToBaht', () => {
  it('แปลงกลับเป็นบาทได้', () => {
    expect(satangToBaht(15_000)).toBe(150);
    expect(satangToBaht(9_999)).toBe(99.99);
    expect(satangToBaht(99)).toBe(0.99);
    expect(satangToBaht(0)).toBe(0);
    expect(satangToBaht(-1_250)).toBe(-12.5);
  });

  it('โยน TypeError เมื่อไม่ใช่จำนวนเต็มสตางค์', () => {
    expect(() => satangToBaht(1.5)).toThrow(TypeError);
    expect(() => satangToBaht('100')).toThrow(TypeError);
    expect(() => satangToBaht(null)).toThrow(TypeError);
    expect(() => satangToBaht(Number.NaN)).toThrow(TypeError);
    expect(() => satangToBaht(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });

  it('แปลงไป-กลับแล้วได้ค่าเดิม', () => {
    for (const satang of [0, 1, 99, 100, 123_456, -123_456, 99_999_999_999]) {
      expect(bahtToSatang(satangToBaht(satang))).toBe(satang);
    }
  });
});

describe('formatBaht', () => {
  it('แสดง 2 ตำแหน่งและคั่นหลักพัน', () => {
    expect(formatBaht(15_000)).toBe('150.00');
    expect(formatBaht(0)).toBe('0.00');
    expect(formatBaht(100_000)).toBe('1,000.00');
    expect(formatBaht(1_234_567)).toBe('12,345.67');
    expect(formatBaht(-500)).toBe('-5.00');
    expect(formatBaht(-123_456)).toBe('-1,234.56');
  });

  it('เติมสัญลักษณ์ ฿ ได้เมื่อขอ', () => {
    expect(formatBaht(15_000, { symbol: true })).toBe('฿150.00');
    expect(formatBaht(-500, { symbol: true })).toBe('฿-5.00');
  });

  it('โยน TypeError เมื่อ input ไม่ใช่จำนวนเต็มสตางค์', () => {
    expect(() => formatBaht(1.5)).toThrow(TypeError);
    expect(() => formatBaht('100')).toThrow(TypeError);
  });
});
