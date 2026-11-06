import { getDb } from '../../db/connection.js';

export function runInTransaction(fn) {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx();
}

export function listActiveVehicles() {
  const db = getDb();
  return db
    .prepare(
      `SELECT v.*,
              e.code AS default_driver_code,
              e.name AS default_driver_name
       FROM vehicles v
       LEFT JOIN employees e ON e.id = v.default_driver_id
       ORDER BY v.id ASC`,
    )
    .all();
}

export function findVehicleById(id) {
  const db = getDb();
  return db
    .prepare(
      `SELECT v.*,
              e.code AS default_driver_code,
              e.name AS default_driver_name
       FROM vehicles v
       LEFT JOIN employees e ON e.id = v.default_driver_id
       WHERE v.id = ?`,
    )
    .get(Number(id));
}

export function listDriverEmployees() {
  const db = getDb();
  return db
    .prepare(
      `SELECT *
       FROM employees
       WHERE is_active = 1
       ORDER BY id ASC`,
    )
    .all();
}

export function findEmployeeById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM employees WHERE id = ?`).get(Number(id));
}

export function findCustomersByIds(ids = []) {
  const cleanIds = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => id > 0)));
  if (cleanIds.length === 0) return [];
  const db = getDb();
  const placeholders = cleanIds.map(() => '?').join(', ');
  return db
    .prepare(
      `SELECT c.*,
              pt.name AS price_tier_name,
              pt.price_189l_sat AS tier_189l_sat,
              pt.price_350ml_sat AS tier_350ml_sat,
              pt.price_600ml_sat AS tier_600ml_sat,
              pt.price_1500ml_sat AS tier_1500ml_sat
       FROM customers c
       LEFT JOIN price_tiers pt ON pt.id = c.price_tier_id
       WHERE c.id IN (${placeholders})`,
    )
    .all(...cleanIds);
}

export function getCustomerPricesForCustomerIds(ids = []) {
  const cleanIds = Array.from(new Set(ids.map((id) => Number(id)).filter((id) => id > 0)));
  if (cleanIds.length === 0) return [];
  const db = getDb();
  const placeholders = cleanIds.map(() => '?').join(', ');
  return db
    .prepare(`SELECT * FROM customer_prices WHERE customer_id IN (${placeholders})`)
    .all(...cleanIds);
}

export function getNextTripSequenceForPrefix(prefix) {
  const db = getDb();
  const row = db
    .prepare(`SELECT code FROM trips WHERE code LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`);
  if (!row || !row.code) return 1;
  const tail = String(row.code).slice(prefix.length);
  const parsed = Number.parseInt(tail, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed + 1 : 1;
}

export function insertTrip({
  code,
  tripDate,
  departedTime = null,
  vehicleId = null,
  driverId = null,
  stopsCount = 0,
  totalDistanceKm = 0,
  estimatedTimeMin = 0,
  total189L = 0,
  totalPacks = 0,
  estimatedFuelCostSat = 0,
  totalRevenueSat = 0,
  status = 'planned',
}) {
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO trips (
         code, trip_date, departed_time, vehicle_id, driver_id,
         stops_count, total_distance_km, estimated_time_min,
         total_189l, total_packs, estimated_fuel_cost_sat, total_revenue_sat, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      code,
      tripDate,
      departedTime ?? null,
      vehicleId ?? null,
      driverId ?? null,
      stopsCount,
      totalDistanceKm,
      estimatedTimeMin,
      total189L,
      totalPacks,
      estimatedFuelCostSat,
      totalRevenueSat,
      status,
    );
  return Number(res.lastInsertRowid);
}

export function replaceTripStops(tripId, stops = []) {
  const db = getDb();
  db.prepare(`DELETE FROM trip_stops WHERE trip_id = ?`).run(Number(tripId));

  const stmt = db.prepare(
    `INSERT INTO trip_stops (
       trip_id, customer_id, seq, distance_from_prev_km, planned_json
     ) VALUES (?, ?, ?, ?, ?)`,
  );

  for (const s of stops) {
    stmt.run(
      Number(tripId),
      Number(s.customerId),
      Number(s.seq),
      Number(s.distanceFromPrevKm ?? 0),
      JSON.stringify(s.planned ?? {}),
    );
  }
}

export function updateTripSummaryById(
  tripId,
  {
    stopsCount,
    totalDistanceKm,
    estimatedTimeMin,
    total189L,
    totalPacks,
    estimatedFuelCostSat,
    totalRevenueSat,
  },
) {
  const db = getDb();
  db.prepare(
    `UPDATE trips
     SET stops_count = ?,
         total_distance_km = ?,
         estimated_time_min = ?,
         total_189l = ?,
         total_packs = ?,
         estimated_fuel_cost_sat = ?,
         total_revenue_sat = ?
     WHERE id = ?`,
  ).run(
    stopsCount,
    totalDistanceKm,
    estimatedTimeMin,
    total189L,
    totalPacks,
    estimatedFuelCostSat,
    totalRevenueSat,
    Number(tripId),
  );
}

export function updateTripStatus(tripId, status) {
  const db = getDb();
  db.prepare(`UPDATE trips SET status = ? WHERE id = ?`).run(status, Number(tripId));
}

export function linkCheckinsToTrip({ tripId, tripDate, customerIds = [] }) {
  const cleanIds = Array.from(new Set(customerIds.map((id) => Number(id)).filter((id) => id > 0)));
  if (cleanIds.length === 0) return 0;
  const db = getDb();
  const placeholders = cleanIds.map(() => '?').join(', ');
  const res = db
    .prepare(
      `UPDATE checkins
       SET trip_id = ?
       WHERE trip_id IS NULL
         AND substr(created_at, 1, 10) = ?
         AND customer_id IN (${placeholders})`,
    )
    .run(Number(tripId), String(tripDate), ...cleanIds);
  return Number(res.changes || 0);
}

export function findTripById(id) {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*,
              v.plate AS vehicle_plate,
              v.name AS vehicle_name,
              v.max_bottles_189l AS vehicle_max_bottles_189l,
              v.max_packs AS vehicle_max_packs,
              v.fuel_rate_km_per_liter AS vehicle_fuel_rate_km_per_liter,
              v.diesel_price_sat_per_liter AS vehicle_diesel_price_sat_per_liter,
              e.code AS driver_code,
              e.name AS driver_name,
              e.phone AS driver_phone
       FROM trips t
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN employees e ON e.id = t.driver_id
       WHERE t.id = ?`,
    )
    .get(Number(id));
}

export function listTripStopsByTripId(tripId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ts.*,
              c.code AS customer_code,
              c.name AS customer_name,
              c.phone AS customer_phone,
              c.zone AS customer_zone,
              c.address AS customer_address,
              c.lat AS customer_lat,
              c.lng AS customer_lng
       FROM trip_stops ts
       JOIN customers c ON c.id = ts.customer_id
       WHERE ts.trip_id = ?
       ORDER BY ts.seq ASC, ts.id ASC`,
    )
    .all(Number(tripId));
}

export function listTrips({
  offset = 0,
  limit = 50,
  dateFrom,
  dateTo,
  vehicleId,
  driverId,
  status,
} = {}) {
  const db = getDb();
  const conditions = ['1 = 1'];
  const params = [];

  if (dateFrom) {
    conditions.push('t.trip_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('t.trip_date <= ?');
    params.push(dateTo);
  }
  if (vehicleId !== undefined && vehicleId !== null) {
    conditions.push('t.vehicle_id = ?');
    params.push(Number(vehicleId));
  }
  if (driverId !== undefined && driverId !== null) {
    conditions.push('t.driver_id = ?');
    params.push(Number(driverId));
  }
  if (status) {
    conditions.push('t.status = ?');
    params.push(status);
  }

  const whereClause = conditions.join(' AND ');

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM trips t WHERE ${whereClause}`)
    .get(...params);
  const total = Number(totalRow?.cnt ?? 0);

  const rows = db
    .prepare(
      `SELECT t.*,
              v.plate AS vehicle_plate,
              v.name AS vehicle_name,
              v.max_bottles_189l AS vehicle_max_bottles_189l,
              v.max_packs AS vehicle_max_packs,
              v.fuel_rate_km_per_liter AS vehicle_fuel_rate_km_per_liter,
              v.diesel_price_sat_per_liter AS vehicle_diesel_price_sat_per_liter,
              e.code AS driver_code,
              e.name AS driver_name,
              e.phone AS driver_phone
       FROM trips t
       LEFT JOIN vehicles v ON v.id = t.vehicle_id
       LEFT JOIN employees e ON e.id = t.driver_id
       WHERE ${whereClause}
       ORDER BY t.trip_date DESC, t.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { rows, total };
}

export function upsertSeedEmployee({
  code,
  name,
  nickname,
  position,
  department,
  phone,
  username,
}) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM employees WHERE code = ?`).get(code);
  if (existing) {
    db.prepare(
      `UPDATE employees
       SET name = ?, nickname = ?, position = ?, department = ?, phone = ?, username = ?,
           is_active = 1, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(name, nickname ?? null, position, department, phone ?? null, username ?? null, existing.id);
    return { id: Number(existing.id), status: 'updated' };
  }

  const res = db
    .prepare(
      `INSERT INTO employees (
         code, name, nickname, position, department, phone, username, is_active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(code, name, nickname ?? null, position, department, phone ?? null, username ?? null);
  return { id: Number(res.lastInsertRowid), status: 'created' };
}

export function upsertSeedVehicle({
  assetCode,
  plate,
  name,
  brand,
  model,
  maxBottles189L,
  maxPacks,
  fuelRateKmPerLiter,
  dieselPriceSatPerLiter,
  defaultDriverId,
}) {
  const db = getDb();

  let assetRow = db.prepare(`SELECT id FROM assets WHERE code = ?`).get(assetCode);
  if (!assetRow) {
    const assetRes = db
      .prepare(
        `INSERT INTO assets (code, name, category, brand, model, status)
         VALUES (?, ?, 'vehicle', ?, ?, 'in_use')`,
      )
      .run(assetCode, `${name} (${plate})`, brand ?? null, model ?? null);
    assetRow = { id: Number(assetRes.lastInsertRowid) };
  } else {
    db.prepare(
      `UPDATE assets
       SET name = ?, category = 'vehicle', brand = ?, model = ?, status = 'in_use', updated_at = datetime('now')
       WHERE id = ?`,
    ).run(`${name} (${plate})`, brand ?? null, model ?? null, assetRow.id);
  }

  const existingVeh = db
    .prepare(`SELECT id FROM vehicles WHERE plate = ? OR asset_id = ?`)
    .get(plate, assetRow.id);

  if (existingVeh) {
    db.prepare(
      `UPDATE vehicles
       SET asset_id = ?, plate = ?, name = ?, brand = ?, model = ?,
           max_bottles_189l = ?, max_packs = ?,
           fuel_rate_km_per_liter = ?, diesel_price_sat_per_liter = ?,
           default_driver_id = ?, status = 'available', updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      assetRow.id,
      plate,
      name,
      brand ?? null,
      model ?? null,
      maxBottles189L,
      maxPacks,
      fuelRateKmPerLiter,
      dieselPriceSatPerLiter,
      defaultDriverId ?? null,
      existingVeh.id,
    );
    return { id: Number(existingVeh.id), assetId: Number(assetRow.id), status: 'updated' };
  }

  const vehRes = db
    .prepare(
      `INSERT INTO vehicles (
         asset_id, plate, name, brand, model,
         max_bottles_189l, max_packs,
         fuel_rate_km_per_liter, diesel_price_sat_per_liter,
         default_driver_id, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
    )
    .run(
      assetRow.id,
      plate,
      name,
      brand ?? null,
      model ?? null,
      maxBottles189L,
      maxPacks,
      fuelRateKmPerLiter,
      dieselPriceSatPerLiter,
      defaultDriverId ?? null,
    );

  return { id: Number(vehRes.lastInsertRowid), assetId: Number(assetRow.id), status: 'created' };
}
