const EARTH_RADIUS_KM = 6371;

/**
 * แปลงองศาเป็นเรเดียน
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * ปัดเศษระยะทางเป็นทศนิยม 2 ตำแหน่ง (กม.)
 * @param {number} km
 * @returns {number}
 */
export function roundKm(km) {
  return Math.round(Number(km || 0) * 100) / 100;
}

/**
 * คำนวณระยะทางเป็นเส้นตรงบนผิวโลกด้วยสูตร Haversine (หน่วย: กิโลเมตร)
 * หากพิกัดไม่ครบหรือไม่ใช่ตัวเลขที่ถูกต้อง จะคืนค่า 0
 * @param {number | null | undefined} lat1
 * @param {number | null | undefined} lng1
 * @param {number | null | undefined} lat2
 * @param {number | null | undefined} lng2
 * @returns {number}
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const aLat = Number(lat1);
  const aLng = Number(lng1);
  const bLat = Number(lat2);
  const bLng = Number(lng2);

  if (
    lat1 === null ||
    lat1 === undefined ||
    lng1 === null ||
    lng1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lng2 === null ||
    lng2 === undefined ||
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  ) {
    return 0;
  }

  if (aLat === bLat && aLng === bLng) return 0;

  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const radLat1 = toRadians(aLat);
  const radLat2 = toRadians(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const a =
    sinDLat * sinDLat +
    Math.cos(radLat1) * Math.cos(radLat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_KM * c;
}

/**
 * คำนวณระยะทางตามลำดับจุดจอดที่กำหนด (จากจุดเริ่มต้น start → stop 1 → stop 2 → ... → stop N)
 * @param {{ lat: number, lng: number }} start
 * @param {Array<{ customerId?: number, lat?: number | null, lng?: number | null, [key: string]: any }>} stops
 */
export function calculateRouteSequence(start, stops = []) {
  const originLat = Number(start?.lat);
  const originLng = Number(start?.lng);

  let currentLat = Number.isFinite(originLat) ? originLat : null;
  let currentLng = Number.isFinite(originLng) ? originLng : null;
  let currentRef = {
    type: 'start',
    customerId: null,
    lat: currentLat,
    lng: currentLng,
  };

  let rawTotalKm = 0;
  const legs = [];
  const orderedStops = [];

  for (let idx = 0; idx < stops.length; idx++) {
    const stop = stops[idx];
    const stopLat = stop?.lat !== null && stop?.lat !== undefined ? Number(stop.lat) : null;
    const stopLng = stop?.lng !== null && stop?.lng !== undefined ? Number(stop.lng) : null;
    const hasCoords = Number.isFinite(stopLat) && Number.isFinite(stopLng);

    const legRawKm =
      hasCoords && currentLat !== null && currentLng !== null
        ? haversineKm(currentLat, currentLng, stopLat, stopLng)
        : 0;
    const legKm = roundKm(legRawKm);
    rawTotalKm += legRawKm;

    const seq = idx + 1;
    const enrichedStop = {
      ...stop,
      seq,
      distanceFromPrevKm: legKm,
      distance_from_prev_km: legKm,
    };
    orderedStops.push(enrichedStop);

    const nextRef = {
      type: 'stop',
      seq,
      customerId: stop?.customerId ?? stop?.customer_id ?? null,
      lat: hasCoords ? stopLat : null,
      lng: hasCoords ? stopLng : null,
    };

    legs.push({
      seq,
      from: currentRef,
      to: nextRef,
      km: legKm,
      distanceKm: legKm,
      rawKm: legRawKm,
    });

    if (hasCoords) {
      currentLat = stopLat;
      currentLng = stopLng;
      currentRef = nextRef;
    }
  }

  const totalKm = roundKm(rawTotalKm);
  return {
    orderedStops,
    legs,
    totalKm,
    totalDistanceKm: totalKm,
    rawTotalKm,
  };
}

/**
 * จัดลำดับจุดจอดด้วยอัลกอริทึม Nearest-Neighbor (TMS-2)
 * - เริ่มจากพิกัดโรงงาน (start)
 * - เลือกจุดจอดถัดไปที่อยู่ใกล้พิกัดปัจจุบันที่สุดทีละจุดจนครบ
 * - กรณีระยะทางเท่ากัน (tie-break) เรียงตาม customerId น้อยไปมาก แล้วตามลำดับเดิม (deterministic)
 * - จุดจอดที่ไม่มีพิกัด (lat/lng เป็น null) จะถูกต่อท้ายตามลำดับเดิม
 *
 * @param {{ lat: number, lng: number }} start
 * @param {Array<{ customerId?: number, lat?: number | null, lng?: number | null, [key: string]: any }>} stops
 */
export function optimizeNearestNeighbor(start, stops = []) {
  if (!Array.isArray(stops) || stops.length === 0) {
    return {
      orderedStops: [],
      legs: [],
      totalKm: 0,
      totalDistanceKm: 0,
      rawTotalKm: 0,
    };
  }

  const withCoords = [];
  const withoutCoords = [];

  stops.forEach((stop, originalIndex) => {
    const lat = stop?.lat !== null && stop?.lat !== undefined ? Number(stop.lat) : NaN;
    const lng = stop?.lng !== null && stop?.lng !== undefined ? Number(stop.lng) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      withCoords.push({ stop, lat, lng, originalIndex });
    } else {
      withoutCoords.push({ stop, originalIndex });
    }
  });

  const remaining = [...withCoords];
  const selected = [];

  let curLat = Number(start?.lat);
  let curLng = Number(start?.lng);
  if (!Number.isFinite(curLat) || !Number.isFinite(curLng)) {
    curLat = remaining[0]?.lat ?? 0;
    curLng = remaining[0]?.lng ?? 0;
  }

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const dist = haversineKm(curLat, curLng, candidate.lat, candidate.lng);

      if (dist < bestDist - 1e-12) {
        bestDist = dist;
        bestIdx = i;
      } else if (Math.abs(dist - bestDist) <= 1e-12) {
        // Tie-breaker: เรียงตาม customerId น้อยไปมาก แล้วตาม originalIndex
        const bestCand = remaining[bestIdx];
        const candId = Number(candidate.stop?.customerId ?? candidate.stop?.customer_id ?? Infinity);
        const bestId = Number(bestCand.stop?.customerId ?? bestCand.stop?.customer_id ?? Infinity);
        if (candId < bestId || (candId === bestId && candidate.originalIndex < bestCand.originalIndex)) {
          bestIdx = i;
          bestDist = dist;
        }
      }
    }

    const [chosen] = remaining.splice(bestIdx, 1);
    selected.push(chosen.stop);
    curLat = chosen.lat;
    curLng = chosen.lng;
  }

  for (const item of withoutCoords) {
    selected.push(item.stop);
  }

  return calculateRouteSequence(start, selected);
}

/**
 * ประมาณเวลาเดินทางรวมเวลาจอดส่งของ (TMS-2)
 * สูตรมาตรฐาน: (totalKm / avgSpeedKmh) * 60 + stopsCount * stopDwellMin
 * ค่าเริ่มต้น: ความเร็วเฉลี่ย 40 กม./ชม. + จอดป้ายละ 10 นาที
 *
 * @param {number} totalKm
 * @param {number} stopsCount
 * @param {{ avgSpeedKmh?: number, stopDwellMin?: number }} [options]
 * @returns {number} เวลาโดยประมาณ (นาที, จำนวนเต็ม)
 */
export function estimateTravelTimeMin(totalKm, stopsCount, options = {}) {
  const km = Math.max(0, Number(totalKm) || 0);
  const count = Math.max(0, Math.trunc(Number(stopsCount) || 0));
  const avgSpeedKmh = Number(options.avgSpeedKmh) > 0 ? Number(options.avgSpeedKmh) : 40;
  const stopDwellMin = Number(options.stopDwellMin) >= 0 ? Number(options.stopDwellMin) : 10;

  const driveMin = (km / avgSpeedKmh) * 60;
  const dwellMin = count * stopDwellMin;
  return Math.round(driveMin + dwellMin);
}

/**
 * คำนวณค่าน้ำมันโดยประมาณ (หน่วย: สตางค์) ตาม SRS TMS-3
 * สูตร: (ระยะทางรวม กม. / อัตราสิ้นเปลือง กม.ต่อลิตร) × ราคาดีเซล (สตางค์/ลิตร)
 * เช่น 100 กม. / 5 กม./ลิตร × 4500 สตางค์ (45.00 บาท) = 90000 สตางค์ (900.00 บาท)
 *
 * @param {number} totalKm
 * @param {number} fuelRateKmPerLiter
 * @param {number} dieselPriceSatPerLiter
 * @returns {number} ค่าน้ำมันหน่วยสตางค์ (จำนวนเต็ม)
 */
export function estimateFuelCostSat(totalKm, fuelRateKmPerLiter, dieselPriceSatPerLiter) {
  const km = Math.max(0, Number(totalKm) || 0);
  const rate = Number(fuelRateKmPerLiter);
  const priceSat = Math.max(0, Number(dieselPriceSatPerLiter) || 0);

  if (!Number.isFinite(rate) || rate <= 0 || km <= 0 || priceSat <= 0) {
    return 0;
  }

  const litersUsed = km / rate;
  return Math.round(litersUsed * priceSat);
}

export default {
  roundKm,
  haversineKm,
  calculateRouteSequence,
  optimizeNearestNeighbor,
  estimateTravelTimeMin,
  estimateFuelCostSat,
};
