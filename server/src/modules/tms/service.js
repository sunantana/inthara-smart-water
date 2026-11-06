import { config } from '../../config.js';
import { AppError } from '../../utils/errors.js';
import {
  calculateRouteSequence,
  estimateFuelCostSat,
  estimateTravelTimeMin,
  optimizeNearestNeighbor,
} from '../../utils/geo.js';
import {
  computePaginationMeta,
  resolveCustomerEffectivePrices,
} from '../customers/service.js';
import { getRouteSheet } from '../orders/service.js';
import * as repo from './repo.js';

export const DEFAULT_SEED_DRIVERS = Object.freeze([
  {
    code: 'EMP-001',
    name: 'สมชาย สายส่ง (คนขับรถหลัก)',
    nickname: 'ชาย',
    position: 'พนักงานขับรถส่งน้ำ',
    department: 'จัดส่ง (Logistics)',
    phone: '081-111-2233',
    username: 'driver',
  },
  {
    code: 'EMP-002',
    name: 'วิชัย ใจดี (คนขับรถสายรอง)',
    nickname: 'ชัย',
    position: 'พนักงานขับรถส่งน้ำ',
    department: 'จัดส่ง (Logistics)',
    phone: '089-444-5566',
    username: null,
  },
]);

export const DEFAULT_SEED_VEHICLES = Object.freeze([
  {
    assetCode: 'AST-VEH-001',
    plate: 'กข-1234 อุตรดิตถ์',
    name: 'รถกระบะส่งน้ำคันที่ 1 (สายในเมือง)',
    brand: 'Isuzu',
    model: 'D-Max Spark 3.0',
    maxBottles189L: 50,
    maxPacks: 100,
    fuelRateKmPerLiter: 5,
    dieselPriceSatPerLiter: 4500, // 45.00 บาท/ลิตร
  },
  {
    assetCode: 'AST-VEH-002',
    plate: 'บบ-5678 อุตรดิตถ์',
    name: 'รถบรรทุก 4 ล้อใหญ่คันที่ 2 (สายรอบนอก)',
    brand: 'Hino',
    model: 'XZU 300',
    maxBottles189L: 120,
    maxPacks: 200,
    fuelRateKmPerLiter: 8,
    dieselPriceSatPerLiter: 4500, // 45.00 บาท/ลิตร
  },
]);

export function seedDefaultTmsResources() {
  return repo.runInTransaction(() => {
    const drivers = [];
    for (const drv of DEFAULT_SEED_DRIVERS) {
      const res = repo.upsertSeedEmployee(drv);
      drivers.push({ ...drv, id: res.id, status: res.status });
    }

    const vehicles = [];
    for (let i = 0; i < DEFAULT_SEED_VEHICLES.length; i++) {
      const veh = DEFAULT_SEED_VEHICLES[i];
      const defaultDriverId = drivers[i]?.id ?? drivers[0]?.id ?? null;
      const res = repo.upsertSeedVehicle({
        ...veh,
        defaultDriverId,
      });
      vehicles.push({
        ...veh,
        id: res.id,
        assetId: res.assetId,
        defaultDriverId,
        status: res.status,
      });
    }

    return { drivers, vehicles };
  });
}

export function buildTripCodePrefix(tripDate) {
  const clean = String(tripDate || '').trim();
  const yymmdd = /^\d{4}-\d{2}-\d{2}$/.test(clean)
    ? clean.slice(2).replace(/-/g, '')
    : new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `TRP-${yymmdd}-`;
}

export function formatTripCode(tripDate, seq) {
  const prefix = buildTripCodePrefix(tripDate);
  const num = Math.max(1, Number(seq) || 1);
  return `${prefix}${String(num).padStart(2, '0')}`;
}

export function mapVehicleDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    assetId: row.asset_id,
    plate: row.plate,
    name: row.name,
    brand: row.brand ?? null,
    model: row.model ?? null,
    maxBottles189L: Number(row.max_bottles_189l ?? 0),
    max_bottles_189l: Number(row.max_bottles_189l ?? 0),
    maxPacks: Number(row.max_packs ?? 0),
    max_packs: Number(row.max_packs ?? 0),
    fuelRateKmPerLiter: Number(row.fuel_rate_km_per_liter ?? 0),
    fuel_rate_km_per_liter: Number(row.fuel_rate_km_per_liter ?? 0),
    dieselPriceSatPerLiter: Number(row.diesel_price_sat_per_liter ?? 0),
    diesel_price_sat_per_liter: Number(row.diesel_price_sat_per_liter ?? 0),
    status: row.status,
    defaultDriverId: row.default_driver_id ?? null,
    defaultDriverCode: row.default_driver_code ?? null,
    defaultDriverName: row.default_driver_name ?? null,
  };
}

export function mapDriverDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nickname: row.nickname ?? null,
    position: row.position ?? null,
    department: row.department ?? null,
    phone: row.phone ?? null,
    username: row.username ?? null,
    isActive: Number(row.is_active ?? 1) === 1,
  };
}

export function listVehicles() {
  let rows = repo.listActiveVehicles();
  if (rows.length === 0) {
    seedDefaultTmsResources();
    rows = repo.listActiveVehicles();
  }
  const data = rows.map(mapVehicleDto);
  return { data, vehicles: data };
}

export function listDrivers() {
  let rows = repo.listDriverEmployees();
  if (rows.length === 0) {
    seedDefaultTmsResources();
    rows = repo.listDriverEmployees();
  }
  const data = rows.map(mapDriverDto);
  return { data, drivers: data };
}

/**
 * แปลงข้อมูลจำนวนสินค้าที่วางแผนไว้ของแต่ละป้ายให้เป็นโครงสร้างมาตรฐานทั้ง 4 SKU
 */
export function normalizeStopPlannedQuantities(rawPlanned = {}, fallbackStopFromRouteSheet = null) {
  const src =
    rawPlanned && Object.keys(rawPlanned).length > 0
      ? rawPlanned
      : fallbackStopFromRouteSheet?.quantities || {};

  const q189 = Math.max(0, Math.trunc(Number(src['FG-189L'] ?? src.qty189L ?? 0)));
  const q350 = Math.max(0, Math.trunc(Number(src['FG-350ML'] ?? src.qty350ML ?? 0)));
  const q600 = Math.max(0, Math.trunc(Number(src['FG-600ML'] ?? src.qty600ML ?? 0)));
  const q1500 = Math.max(0, Math.trunc(Number(src['FG-1500ML'] ?? src.qty1500ML ?? 0)));

  return {
    'FG-189L': q189,
    'FG-350ML': q350,
    'FG-600ML': q600,
    'FG-1500ML': q1500,
  };
}

/**
 * ตรวจสอบความจุรถ (TMS-4 & TMS-5):
 * - ถ้าเกินความจุสูงสุด (max_bottles_189l หรือ max_packs) → โยน 409 CONFLICT พร้อมตัวเลขชัดเจน
 * - ถ้าถึง 90% ของความจุ → คืนข้อความเตือนใน warnings[]
 */
export function evaluateVehicleCapacity(vehicle, { total189L, totalPacks }) {
  const warnings = [];
  if (!vehicle) return warnings;

  const maxBottles = Number(vehicle.max_bottles_189l ?? vehicle.maxBottles189L ?? 0);
  const maxPacks = Number(vehicle.max_packs ?? vehicle.maxPacks ?? 0);
  const plateLabel = vehicle.plate || vehicle.name || `ID:${vehicle.id}`;

  if (maxBottles > 0 && total189L > maxBottles) {
    throw AppError.conflict(
      `น้ำหนัก/จำนวนบรรทุกเกินความจุรถ [${plateLabel}]: ถัง 18.9L รวม ${total189L} ถัง เกินความจุสูงสุด ${maxBottles} ถัง`,
      [
        {
          field: 'total189L',
          issue: `จำนวนถัง 18.9L (${total189L}) เกินความจุรถ (${maxBottles})`,
          current: total189L,
          max: maxBottles,
        },
      ],
    );
  }

  if (maxPacks > 0 && totalPacks > maxPacks) {
    throw AppError.conflict(
      `น้ำหนัก/จำนวนบรรทุกเกินความจุรถ [${plateLabel}]: น้ำแพ็ครวม ${totalPacks} แพ็ค เกินความจุสูงสุด ${maxPacks} แพ็ค`,
      [
        {
          field: 'totalPacks',
          issue: `จำนวนน้ำแพ็ค (${totalPacks}) เกินความจุรถ (${maxPacks})`,
          current: totalPacks,
          max: maxPacks,
        },
      ],
    );
  }

  if (maxBottles > 0 && total189L >= Math.ceil(maxBottles * 0.9)) {
    const pct = Math.round((total189L / maxBottles) * 100);
    warnings.push(
      `คำเตือนความจุรถ [${plateLabel}]: ถัง 18.9L บรรทุก ${total189L}/${maxBottles} ถัง (${pct}% ของความจุ)`,
    );
  }

  if (maxPacks > 0 && totalPacks >= Math.ceil(maxPacks * 0.9)) {
    const pct = Math.round((totalPacks / maxPacks) * 100);
    warnings.push(
      `คำเตือนความจุรถ [${plateLabel}]: น้ำแพ็คบรรทุก ${totalPacks}/${maxPacks} แพ็ค (${pct}% ของความจุ)`,
    );
  }

  return warnings;
}

/**
 * GET /api/tms/plan?date&zone
 * ดึงป้ายจอดจากใบเส้นทางส่งของ (route-sheet) ของวัน/โซนนั้น พร้อมพิกัดโรงงาน รายชื่อรถ และพนักงานขับรถ
 */
export function getTmsPlan(query = {}) {
  const date = query.date || new Date().toISOString().slice(0, 10);
  const zone = query.zone?.trim() || undefined;

  const routeSheet = getRouteSheet({ date, zone });
  const { data: vehicles } = listVehicles();
  const { data: drivers } = listDrivers();

  const stopsWithSeq = routeSheet.stops.map((stop, idx) => ({
    ...stop,
    seq: idx + 1,
    planned: { ...stop.quantities },
  }));

  const routeCalc = calculateRouteSequence(config.factoryLocation, stopsWithSeq);
  const estimatedTimeMin = estimateTravelTimeMin(
    routeCalc.totalDistanceKm,
    routeCalc.orderedStops.length,
  );

  const total189L = Number(routeSheet.quantities['FG-189L'] ?? 0);
  const totalPacks =
    Number(routeSheet.quantities['FG-350ML'] ?? 0) +
    Number(routeSheet.quantities['FG-600ML'] ?? 0) +
    Number(routeSheet.quantities['FG-1500ML'] ?? 0);

  return {
    date,
    zone: zone ?? null,
    factory: config.factoryLocation,
    totalStops: routeCalc.orderedStops.length,
    totalOrders: routeSheet.totalOrders,
    totalDistanceKm: routeCalc.totalDistanceKm,
    estimatedTimeMin,
    total189L,
    totalPacks,
    totalRevenueSat: routeSheet.totalSat,
    quantities: routeSheet.quantities,
    stops: routeCalc.orderedStops,
    legs: routeCalc.legs,
    vehicles,
    drivers,
    data: {
      date,
      zone: zone ?? null,
      factory: config.factoryLocation,
      totalStops: routeCalc.orderedStops.length,
      totalOrders: routeSheet.totalOrders,
      totalDistanceKm: routeCalc.totalDistanceKm,
      estimatedTimeMin,
      total189L,
      totalPacks,
      totalRevenueSat: routeSheet.totalSat,
      quantities: routeSheet.quantities,
      stops: routeCalc.orderedStops,
      legs: routeCalc.legs,
      vehicles,
      drivers,
    },
  };
}

/**
 * POST /api/tms/optimize
 * จัดลำดับจุดจอดด้วย Nearest-Neighbor จากจุดเริ่มต้น (ค่าเริ่มต้นคือพิกัดโรงงานใน config.js)
 */
export function optimizeRoute(payload = {}) {
  const start = payload.start?.lat !== undefined && payload.start?.lng !== undefined
    ? payload.start
    : config.factoryLocation;

  const rawStops = Array.isArray(payload.stops) ? payload.stops : [];

  // หากส่งมาเฉพาะ customerId โดยไม่มี lat/lng ให้ดึงพิกัดจากฐานข้อมูลลูกค้าให้อัตโนมัติ
  const missingCoordIds = rawStops
    .filter((s) => (s.lat === undefined || s.lng === undefined) && (s.customerId || s.customer_id))
    .map((s) => Number(s.customerId ?? s.customer_id));

  const customerMap = new Map();
  if (missingCoordIds.length > 0) {
    for (const c of repo.findCustomersByIds(missingCoordIds)) {
      customerMap.set(c.id, c);
    }
  }

  const normalizedStops = rawStops.map((s) => {
    const cid = Number(s.customerId ?? s.customer_id ?? 0) || undefined;
    const dbCust = cid ? customerMap.get(cid) : null;
    return {
      ...s,
      customerId: cid ?? s.customerId,
      customerCode: s.customerCode ?? dbCust?.code ?? null,
      customerName: s.customerName ?? dbCust?.name ?? null,
      lat: s.lat !== undefined ? s.lat : (dbCust?.lat ?? null),
      lng: s.lng !== undefined ? s.lng : (dbCust?.lng ?? null),
    };
  });

  const result = optimizeNearestNeighbor(start, normalizedStops);
  const estimatedTimeMin = estimateTravelTimeMin(
    result.totalDistanceKm,
    result.orderedStops.length,
  );

  return {
    start,
    orderedStops: result.orderedStops,
    legs: result.legs,
    totalKm: result.totalKm,
    totalDistanceKm: result.totalDistanceKm,
    estimatedTimeMin,
    data: {
      start,
      orderedStops: result.orderedStops,
      legs: result.legs,
      totalKm: result.totalKm,
      totalDistanceKm: result.totalDistanceKm,
      estimatedTimeMin,
    },
  };
}

/**
 * คำนวณข้อมูลจุดจอด ระยะทาง เวลา จำนวนสินค้า และรายได้รวมของทริปจากรายการ stops
 */
function buildTripStopsCalculation({ tripDate, rawStops, vehicle }) {
  // Sort by seq if caller explicitly sent seq for every item; otherwise preserve array order
  const indexed = rawStops.map((s, idx) => ({
    ...s,
    _idx: idx,
    _seq: s.seq !== undefined && s.seq !== null ? Number(s.seq) : idx + 1,
  }));

  const hasCustomSeq = rawStops.every((s) => s.seq !== undefined && s.seq !== null);
  if (hasCustomSeq) {
    indexed.sort((a, b) => a._seq - b._seq || a._idx - b._idx);
  }

  const customerIds = indexed.map((s) => Number(s.customerId));
  const customerRows = repo.findCustomersByIds(customerIds);
  const customerMap = new Map(customerRows.map((c) => [c.id, c]));
  const allPriceRows = repo.getCustomerPricesForCustomerIds(customerIds);
  const priceRowsByCustomer = new Map();
  for (const pr of allPriceRows) {
    const arr = priceRowsByCustomer.get(pr.customer_id) || [];
    arr.push(pr);
    priceRowsByCustomer.set(pr.customer_id, arr);
  }

  for (const cid of customerIds) {
    if (!customerMap.has(cid)) {
      throw AppError.notFound(`ไม่พบข้อมูลลูกค้ารหัส ID ${cid}`);
    }
  }

  // ดึง route-sheet ของวันนั้นเพื่อใช้เป็นค่าเริ่มต้นกรณีผู้เรียกไม่ส่ง planned quantities มาใน stop
  const routeSheet = getRouteSheet({ date: tripDate });
  const routeStopByCustomer = new Map(
    routeSheet.stops.map((st) => [Number(st.customerId), st]),
  );

  let total189L = 0;
  let totalPacks = 0;
  let totalRevenueSat = 0;

  const stopsForGeo = indexed.map((inputStop, idx) => {
    const cid = Number(inputStop.customerId);
    const cust = customerMap.get(cid);
    const custPriceRows = priceRowsByCustomer.get(cid) || [];
    const rsStop = routeStopByCustomer.get(cid) || null;

    const rawPlanned = inputStop.planned ?? inputStop.quantities ?? {};
    const planned = normalizeStopPlannedQuantities(rawPlanned, rsStop);

    const stop189L = planned['FG-189L'];
    const stopPacks =
      planned['FG-350ML'] + planned['FG-600ML'] + planned['FG-1500ML'];

    total189L += stop189L;
    totalPacks += stopPacks;

    // คำนวณรายได้ของป้ายนี้: ถ้ามีจาก route-sheet และไม่ได้ override จำนวนสินค้า ใช้ยอดจริงจากออเดอร์
    // มิฉะนั้นคำนวณจากราคาจริงของลูกค้า × จำนวนที่วางแผน
    const effectivePrices = resolveCustomerEffectivePrices(cust, custPriceRows);
    const calculatedStopRevenueSat =
      planned['FG-189L'] * Number(effectivePrices['FG-189L'] ?? 0) +
      planned['FG-350ML'] * Number(effectivePrices['FG-350ML'] ?? 0) +
      planned['FG-600ML'] * Number(effectivePrices['FG-600ML'] ?? 0) +
      planned['FG-1500ML'] * Number(effectivePrices['FG-1500ML'] ?? 0);

    const stopRevenueSat =
      rawPlanned?.totalSat !== undefined
        ? Number(rawPlanned.totalSat)
        : calculatedStopRevenueSat > 0
          ? calculatedStopRevenueSat
          : Number(rsStop?.totalSat ?? 0);

    totalRevenueSat += stopRevenueSat;

    return {
      customerId: cid,
      seq: idx + 1,
      lat: cust.lat ?? null,
      lng: cust.lng ?? null,
      planned: {
        ...planned,
        totalSat: stopRevenueSat,
      },
    };
  });

  const warnings = evaluateVehicleCapacity(vehicle, { total189L, totalPacks });

  const geoCalc = calculateRouteSequence(config.factoryLocation, stopsForGeo);
  const totalDistanceKm = geoCalc.totalDistanceKm;
  const estimatedTimeMin = estimateTravelTimeMin(
    totalDistanceKm,
    geoCalc.orderedStops.length,
  );
  const estimatedFuelCostSat = vehicle
    ? estimateFuelCostSat(
        totalDistanceKm,
        vehicle.fuel_rate_km_per_liter,
        vehicle.diesel_price_sat_per_liter,
      )
    : 0;

  return {
    orderedStops: geoCalc.orderedStops,
    stopsCount: geoCalc.orderedStops.length,
    totalDistanceKm,
    estimatedTimeMin,
    total189L,
    totalPacks,
    estimatedFuelCostSat,
    totalRevenueSat,
    warnings,
  };
}

export function mapTripStopDto(row) {
  let planned = {
    'FG-189L': 0,
    'FG-350ML': 0,
    'FG-600ML': 0,
    'FG-1500ML': 0,
    totalSat: 0,
  };
  if (row.planned_json) {
    try {
      const parsed = JSON.parse(row.planned_json);
      planned = {
        'FG-189L': Number(parsed['FG-189L'] ?? 0),
        'FG-350ML': Number(parsed['FG-350ML'] ?? 0),
        'FG-600ML': Number(parsed['FG-600ML'] ?? 0),
        'FG-1500ML': Number(parsed['FG-1500ML'] ?? 0),
        totalSat: Number(parsed.totalSat ?? 0),
      };
    } catch {
      // ignore malformed JSON
    }
  }

  const distanceFromPrevKm = Number(row.distance_from_prev_km ?? 0);
  return {
    id: row.id,
    tripId: row.trip_id,
    customerId: row.customer_id,
    customer_id: row.customer_id,
    customerCode: row.customer_code ?? null,
    customerName: row.customer_name ?? null,
    phone: row.customer_phone ?? null,
    zone: row.customer_zone ?? null,
    address: row.customer_address ?? null,
    lat: row.customer_lat ?? null,
    lng: row.customer_lng ?? null,
    seq: Number(row.seq),
    distanceFromPrevKm,
    distance_from_prev_km: distanceFromPrevKm,
    planned,
    quantities: planned,
  };
}

export function mapTripDto(row, stopRows = null, warnings = []) {
  if (!row) return null;
  const totalDistanceKm = Number(row.total_distance_km ?? 0);
  const estimatedTimeMin = Number(row.estimated_time_min ?? 0);
  const total189L = Number(row.total_189l ?? 0);
  const totalPacks = Number(row.total_packs ?? 0);
  const estimatedFuelCostSat = Number(row.estimated_fuel_cost_sat ?? 0);
  const totalRevenueSat = Number(row.total_revenue_sat ?? 0);

  const dto = {
    id: row.id,
    code: row.code,
    tripDate: row.trip_date,
    trip_date: row.trip_date,
    departedTime: row.departed_time ?? null,
    departed_time: row.departed_time ?? null,
    vehicleId: row.vehicle_id ?? null,
    vehicle_id: row.vehicle_id ?? null,
    vehiclePlate: row.vehicle_plate ?? null,
    vehicleName: row.vehicle_name ?? null,
    vehicleMaxBottles189L:
      row.vehicle_max_bottles_189l !== undefined && row.vehicle_max_bottles_189l !== null
        ? Number(row.vehicle_max_bottles_189l)
        : null,
    vehicleMaxPacks:
      row.vehicle_max_packs !== undefined && row.vehicle_max_packs !== null
        ? Number(row.vehicle_max_packs)
        : null,
    driverId: row.driver_id ?? null,
    driver_id: row.driver_id ?? null,
    driverCode: row.driver_code ?? null,
    driverName: row.driver_name ?? null,
    driverPhone: row.driver_phone ?? null,
    stopsCount: Number(row.stops_count ?? 0),
    stops_count: Number(row.stops_count ?? 0),
    totalDistanceKm,
    total_distance_km: totalDistanceKm,
    estimatedTimeMin,
    estimated_time_min: estimatedTimeMin,
    total189L,
    total_189l: total189L,
    totalPacks,
    total_packs: totalPacks,
    estimatedFuelCostSat,
    estimated_fuel_cost_sat: estimatedFuelCostSat,
    totalRevenueSat,
    total_revenue_sat: totalRevenueSat,
    status: row.status,
    createdAt: row.created_at,
    warnings,
  };

  if (Array.isArray(stopRows)) {
    dto.stops = stopRows.map(mapTripStopDto);
  }

  return dto;
}

export function getTripById(id, warnings = []) {
  const row = repo.findTripById(Number(id));
  if (!row) {
    throw AppError.notFound('ไม่พบข้อมูลทริปจัดส่งที่ระบุ');
  }
  const stopRows = repo.listTripStopsByTripId(row.id);

  // คำนวณคำเตือนความจุรถกรณีโหลด >= 90%
  let computedWarnings = [...warnings];
  if (computedWarnings.length === 0 && row.vehicle_id) {
    const vehicle = repo.findVehicleById(row.vehicle_id);
    if (vehicle) {
      try {
        computedWarnings = evaluateVehicleCapacity(vehicle, {
          total189L: Number(row.total_189l ?? 0),
          totalPacks: Number(row.total_packs ?? 0),
        });
      } catch {
        // ignore conflict when reading existing trip
      }
    }
  }

  const trip = mapTripDto(row, stopRows, computedWarnings);
  return {
    ...trip,
    data: trip,
  };
}

/**
 * POST /api/tms/trips
 * สร้างทริปจัดส่งใหม่ + บันทึก trip_stops + ตรวจสอบความจุรถ (เกินโยน 409) + คำนวณค่าน้ำมัน/ระยะทาง/เวลา
 */
export function createTrip(payload) {
  const tripDate = payload.tripDate || new Date().toISOString().slice(0, 10);
  const vehicleId = payload.vehicleId ? Number(payload.vehicleId) : null;
  const driverId = payload.driverId ? Number(payload.driverId) : null;

  let vehicle = null;
  if (vehicleId) {
    vehicle = repo.findVehicleById(vehicleId);
    if (!vehicle) {
      throw AppError.notFound(`ไม่พบข้อมูลรถขนส่งรหัส ID ${vehicleId}`);
    }
  }

  if (driverId) {
    const driver = repo.findEmployeeById(driverId);
    if (!driver) {
      throw AppError.notFound(`ไม่พบข้อมูลพนักงานขับรถรหัส ID ${driverId}`);
    }
    if (Number(driver.is_active ?? 1) !== 1) {
      throw AppError.badRequest(
        `พนักงานขับรถ [${driver.code}] ${driver.name} มีสถานะไม่ใช้งาน (inactive) ไม่สามารถจัดทริปได้ (EMP-2)`,
      );
    }
  }

  const calc = buildTripStopsCalculation({
    tripDate,
    rawStops: payload.stops,
    vehicle,
  });

  const tripId = repo.runInTransaction(() => {
    const prefix = buildTripCodePrefix(tripDate);
    const seq = repo.getNextTripSequenceForPrefix(prefix);
    const code = formatTripCode(tripDate, seq);

    const insertedId = repo.insertTrip({
      code,
      tripDate,
      departedTime: payload.departedTime ?? null,
      vehicleId,
      driverId,
      stopsCount: calc.stopsCount,
      totalDistanceKm: calc.totalDistanceKm,
      estimatedTimeMin: calc.estimatedTimeMin,
      total189L: calc.total189L,
      totalPacks: calc.totalPacks,
      estimatedFuelCostSat: calc.estimatedFuelCostSat,
      totalRevenueSat: calc.totalRevenueSat,
      status: 'planned',
    });

    repo.replaceTripStops(insertedId, calc.orderedStops);
    return insertedId;
  });

  return getTripById(tripId, calc.warnings);
}

/**
 * PUT /api/tms/trips/:id/stops
 * จัดลำดับจุดจอดในทริปใหม่ (TMS-6) แล้วคำนวณระยะทางแต่ละช่วง ระยะทางรวม เวลา และค่าน้ำมันใหม่ทั้งหมดใน transaction เดียว
 */
export function updateTripStops(id, payload) {
  const tripId = Number(id);
  const existing = repo.findTripById(tripId);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลทริปจัดส่งที่ต้องการแก้ไขจุดจอด');
  }

  if (existing.status === 'completed' || existing.status === 'cancelled') {
    throw AppError.conflict(
      `ทริป [${existing.code}] มีสถานะ "${existing.status}" ไม่สามารถแก้ไขลำดับจุดจอดได้`,
    );
  }

  const vehicle = existing.vehicle_id ? repo.findVehicleById(existing.vehicle_id) : null;

  // ดึง planned_json เดิมของทริปไว้ใช้กรณีผู้เรียกส่งมาเฉพาะ [{customerId, seq}] ตอนสลับลำดับ
  const currentStopRows = repo.listTripStopsByTripId(tripId);
  const existingPlannedByCustomer = new Map();
  for (const st of currentStopRows) {
    const dto = mapTripStopDto(st);
    existingPlannedByCustomer.set(Number(st.customer_id), dto.planned);
  }

  const mergedStopsInput = payload.stops.map((s) => {
    const cid = Number(s.customerId);
    const prevPlanned = existingPlannedByCustomer.get(cid);
    const hasExplicitPlanned =
      (s.planned && Object.keys(s.planned).length > 0) ||
      (s.quantities && Object.keys(s.quantities).length > 0);
    return {
      ...s,
      customerId: cid,
      planned: hasExplicitPlanned ? (s.planned ?? s.quantities) : prevPlanned,
    };
  });

  const calc = buildTripStopsCalculation({
    tripDate: existing.trip_date,
    rawStops: mergedStopsInput,
    vehicle,
  });

  repo.runInTransaction(() => {
    repo.replaceTripStops(tripId, calc.orderedStops);
    repo.updateTripSummaryById(tripId, {
      stopsCount: calc.stopsCount,
      totalDistanceKm: calc.totalDistanceKm,
      estimatedTimeMin: calc.estimatedTimeMin,
      total189L: calc.total189L,
      totalPacks: calc.totalPacks,
      estimatedFuelCostSat: calc.estimatedFuelCostSat,
      totalRevenueSat: calc.totalRevenueSat,
    });
  });

  return getTripById(tripId, calc.warnings);
}

/**
 * POST /api/tms/trips/:id/complete
 * ปิดทริป (status = 'completed') และผูก checkins ของวันนั้นที่มีลูกค้าอยู่ในทริปเข้ากับ trip_id
 */
export function completeTrip(id) {
  const tripId = Number(id);
  const existing = repo.findTripById(tripId);
  if (!existing) {
    throw AppError.notFound('ไม่พบข้อมูลทริปจัดส่งที่ต้องการปิดทริป');
  }

  if (existing.status === 'cancelled') {
    throw AppError.conflict(`ทริป [${existing.code}] ถูกยกเลิกแล้ว ไม่สามารถปิดทริปได้`);
  }

  const stopRows = repo.listTripStopsByTripId(tripId);
  const customerIds = stopRows.map((s) => Number(s.customer_id));

  let linkedCheckins = 0;
  repo.runInTransaction(() => {
    repo.updateTripStatus(tripId, 'completed');
    linkedCheckins = repo.linkCheckinsToTrip({
      tripId,
      tripDate: existing.trip_date,
      customerIds,
    });
  });

  const updated = getTripById(tripId);
  return {
    ...updated,
    linkedCheckins,
    data: {
      ...updated.data,
      linkedCheckins,
    },
  };
}

/**
 * GET /api/tms/trips
 */
export function listTrips(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const offset = (page - 1) * limit;

  const { rows, total } = repo.listTrips({
    offset,
    limit,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    vehicleId: query.vehicleId,
    driverId: query.driverId,
    status: query.status,
  });

  const data = rows.map((r) => mapTripDto(r));
  return {
    data,
    trips: data,
    meta: computePaginationMeta(page, limit, total),
  };
}

export default {
  seedDefaultTmsResources,
  listVehicles,
  listDrivers,
  getTmsPlan,
  optimizeRoute,
  createTrip,
  getTripById,
  updateTripStops,
  completeTrip,
  listTrips,
};
