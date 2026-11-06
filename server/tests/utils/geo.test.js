import { describe, expect, it } from 'vitest';
import {
  calculateRouteSequence,
  estimateFuelCostSat,
  estimateTravelTimeMin,
  haversineKm,
  optimizeNearestNeighbor,
  roundKm,
} from '../../src/utils/geo.js';

describe('Geo Calculator Utilities (TMS-1 / TMS-2 / TMS-3)', () => {
  const FACTORY = {
    lat: 17.816882513503195,
    lng: 100.36169257553256,
  };

  it('haversineKm คำนวณระยะทางเป็นเส้นตรงตรงกับสูตรคณิตศาสตร์มาตรฐาน (R = 6371 กม.)', () => {
    // 1 องศาละติจูดบนเส้นแวงเดียวกัน = (π / 180) * 6371 ≈ 111.1949266 กม.
    const d1Lat = haversineKm(17.0, 100.0, 18.0, 100.0);
    const manual1Lat = (Math.PI / 180) * 6371;
    expect(d1Lat).toBeCloseTo(manual1Lat, 6);
    expect(roundKm(d1Lat)).toBe(111.19);

    // จุดเดียวกันได้ 0 กม. และพิกัดเป็น null ได้ 0 กม.
    expect(haversineKm(FACTORY.lat, FACTORY.lng, FACTORY.lat, FACTORY.lng)).toBe(0);
    expect(haversineKm(null, 100.0, 17.8, 100.3)).toBe(0);
  });

  it('optimizeNearestNeighbor เรียงลำดับจุดจอด 5 จุดแบบ deterministic ใกล้สุดก่อนและคำนวณระยะทางตรงกับคำนวณมือ', () => {
    // กำหนด 5 จุดที่วางเรียงไปทางทิศเหนือจากโรงงาน แต่ส่งเข้ามาแบบสลับลำดับ
    const p1 = { customerId: 101, name: 'Stop-1 (ใกล้สุด ~1.46 กม.)', lat: 17.83, lng: 100.36169257553256 };
    const p2 = { customerId: 102, name: 'Stop-2 (~3.68 กม.)', lat: 17.85, lng: 100.36169257553256 };
    const p3 = { customerId: 103, name: 'Stop-3 (~7.02 กม.)', lat: 17.88, lng: 100.36169257553256 };
    const p4 = { customerId: 104, name: 'Stop-4 (~11.47 กม.)', lat: 17.92, lng: 100.36169257553256 };
    const p5 = { customerId: 105, name: 'Stop-5 (ไกลสุด ~17.03 กม.)', lat: 17.97, lng: 100.36169257553256 };

    const scrambled = [p4, p2, p5, p1, p3];
    const result = optimizeNearestNeighbor(FACTORY, scrambled);

    expect(result.orderedStops.map((s) => s.customerId)).toEqual([101, 102, 103, 104, 105]);
    expect(result.orderedStops.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5]);

    // คำนวณมือทีละช่วง: Factory -> p1 -> p2 -> p3 -> p4 -> p5
    const leg1 = haversineKm(FACTORY.lat, FACTORY.lng, p1.lat, p1.lng);
    const leg2 = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng);
    const leg3 = haversineKm(p2.lat, p2.lng, p3.lat, p3.lng);
    const leg4 = haversineKm(p3.lat, p3.lng, p4.lat, p4.lng);
    const leg5 = haversineKm(p4.lat, p4.lng, p5.lat, p5.lng);
    const manualTotalKm = roundKm(leg1 + leg2 + leg3 + leg4 + leg5);

    expect(result.totalDistanceKm).toBe(manualTotalKm);
    expect(result.orderedStops[0].distanceFromPrevKm).toBe(roundKm(leg1));
    expect(result.orderedStops[4].distanceFromPrevKm).toBe(roundKm(leg5));

    // ถ้าลำดับกลับกัน (p5 -> p1) ระยะทางรวมจะต้องมากกว่าลำดับ Nearest-Neighbor
    const unoptimized = calculateRouteSequence(FACTORY, scrambled);
    expect(unoptimized.totalDistanceKm).toBeGreaterThan(result.totalDistanceKm);
  });

  it('estimateTravelTimeMin คำนวณเวลาเดินทาง (40 กม./ชม. + จอดป้ายละ 10 นาที) ได้ถูกต้อง', () => {
    // 40 กม. ที่ 40 กม./ชม. = 60 นาที + 5 ป้าย * 10 นาที = 110 นาที
    expect(estimateTravelTimeMin(40, 5)).toBe(110);
    // 20 กม. = 30 นาที + 3 ป้าย * 10 นาที = 60 นาที
    expect(estimateTravelTimeMin(20, 3)).toBe(60);
  });

  it('estimateFuelCostSat คำนวณค่าน้ำมันหน่วยสตางค์ตรงตามสูตร: 100 กม. / 5 กม./ลิตร × 45.00 บาท = 900 บาท (90,000 สตางค์)', () => {
    const costSat = estimateFuelCostSat(100, 5, 4500);
    expect(costSat).toBe(90_000); // 900.00 บาท = 90,000 สตางค์

    expect(estimateFuelCostSat(0, 5, 4500)).toBe(0);
    expect(estimateFuelCostSat(100, 0, 4500)).toBe(0);
  });
});
