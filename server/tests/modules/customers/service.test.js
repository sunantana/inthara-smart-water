import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICES_SAT,
  computePaginationMeta,
  extractLatLngFromText,
  formatCustomerCode,
  normalizeCustomer,
  resolveCustomerEffectivePrices,
  resolveGoogleMapsUrl,
} from '../../../src/modules/customers/service.js';

describe('Unit Tests — Customers Service (คำนวณ / Pagination / Normalize / Google Maps)', () => {
  it('formatCustomerCode สร้างรหัส CUS-0001 ตามลำดับอย่างถูกต้อง', () => {
    expect(formatCustomerCode(1)).toBe('CUS-0001');
    expect(formatCustomerCode(42)).toBe('CUS-0042');
    expect(formatCustomerCode(1250)).toBe('CUS-1250');
  });

  it('computePaginationMeta คำนวณหน้า จำนวนทั้งหมด และ totalPages ถูกต้อง', () => {
    expect(computePaginationMeta(1, 50, 0)).toEqual({
      page: 1,
      limit: 50,
      total: 0,
      totalPages: 1,
    });
    expect(computePaginationMeta(1, 50, 60)).toEqual({
      page: 1,
      limit: 50,
      total: 60,
      totalPages: 2,
    });
    expect(computePaginationMeta(2, 50, 100)).toEqual({
      page: 2,
      limit: 50,
      total: 100,
      totalPages: 2,
    });
  });

  it('normalizeCustomer จัดรูปแบบที่อยู่ไทยและสร้างโซน/ที่อยู่รวมอัตโนมัติ', () => {
    const normalized = normalizeCustomer({
      customerType: 'shop',
      name: '  ร้านค้าท่าปลา  ',
      houseNo: '99/1',
      moo: '4',
      subdistrict: 'จริม',
      district: 'ท่าปลา',
      province: 'อุตรดิตถ์',
      postalCode: '53150',
      phone: '081-234-5678',
    });

    expect(normalized).toMatchObject({
      customerType: 'shop',
      name: 'ร้านค้าท่าปลา',
      houseNo: '99/1',
      moo: 'หมู่ 4',
      subdistrict: 'จริม',
      district: 'ท่าปลา',
      province: 'อุตรดิตถ์',
      postalCode: '53150',
      zone: 'โซนท่าปลา - ต.จริม',
      address: 'บ้านเลขที่ 99/1 หมู่ 4 ต.จริม อ.ท่าปลา จ.อุตรดิตถ์ 53150',
      isActive: true,
    });
  });

  it('resolveCustomerEffectivePrices ใช้ราคาจาก Tier เป็นฐานและทับด้วย customer_prices เฉพาะราย', () => {
    const row = {
      tier_189l_sat: 1200,
      tier_350ml_sat: 3000,
      tier_600ml_sat: 3200,
      tier_1500ml_sat: 3200,
    };
    const overrides = [
      { sku: 'FG-189L', unit_price_sat: 1100 },
      { sku: 'FG-600ML', unit_price_sat: 3100 },
    ];

    const effective = resolveCustomerEffectivePrices(row, overrides);
    expect(effective).toEqual({
      'FG-189L': 1100,
      'FG-350ML': 3000,
      'FG-600ML': 3100,
      'FG-1500ML': 3200,
    });

    const fallbackEffective = resolveCustomerEffectivePrices({}, []);
    expect(fallbackEffective).toEqual(DEFAULT_PRICES_SAT);
  });

  it('extractLatLngFromText ดึงพิกัดจากรูปแบบ !3d!4d, @lat,lng และ ?q=lat,lng ได้ครบ', () => {
    expect(
      extractLatLngFromText(
        'https://www.google.com/maps/place/Inthara/@17.7915,100.3782,17z/data=!3d17.792123!4d100.379456',
      ),
    ).toEqual({ lat: 17.792123, lng: 100.379456 });

    expect(extractLatLngFromText('https://maps.google.com/?q=17.7865,100.4310')).toEqual({
      lat: 17.7865,
      lng: 100.431,
    });

    expect(
      extractLatLngFromText('https://www.google.com/maps/@17.7340,100.3520,15z'),
    ).toEqual({
      lat: 17.734,
      lng: 100.352,
    });
  });

  it('resolveGoogleMapsUrl ตาม redirect ของลิงก์สั้น maps.app.goo.gl และจำกัดไม่เกิน 5 hop', async () => {
    const fakeRedirectChain = async (url) => {
      if (url === 'https://maps.app.goo.gl/intharaThapla1') {
        return {
          status: 302,
          headers: new Map([
            [
              'location',
              'https://www.google.com/maps/place/%E0%B8%97%E0%B9%88%E0%B8%B2%E0%B8%9B%E0%B8%A5%E0%B8%B2/@17.7915,100.3782,16z/data=!3d17.791525!4d100.378215',
            ],
          ]),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const resolved = await resolveGoogleMapsUrl(
      'https://maps.app.goo.gl/intharaThapla1',
      fakeRedirectChain,
    );

    expect(resolved).toMatchObject({
      lat: 17.791525,
      lng: 100.378215,
      hops: 1,
    });
  });
});
