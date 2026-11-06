import { AppError } from '../../utils/errors.js';
import * as repo from './repo.js';

function mapExpenseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    refType: row.ref_type ?? null,
    refId: row.ref_id ?? null,
    description: row.description ?? null,
    amountSat: Number(row.amount_sat ?? 0),
    createdBy: row.created_by ?? null,
    createdByUsername: row.created_by_username ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at ?? null,
  };
}

/**
 * GET /api/expenses (EXP-1)
 */
export function listExpenses(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  const { rows, total, totalAmountSat } = repo.listExpenses({
    category: query.category,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    refType: query.refType,
    refId: query.refId,
    page,
    limit,
  });

  const items = rows.map(mapExpenseRow);
  return {
    items,
    data: items,
    expenses: items,
    total,
    totalAmountSat,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * POST /api/expenses (EXP-1)
 */
export function createExpense(payload, actor) {
  const id = repo.insertExpense({
    date: payload.date,
    category: payload.category,
    refType: payload.refType ?? null,
    refId: payload.refId ?? null,
    description: payload.description ?? null,
    amountSat: payload.amountSat,
    createdBy: actor?.id ?? null,
  });

  return mapExpenseRow(repo.findExpenseById(id));
}

/**
 * GET /api/expenses/costing/trips/:tripId (EXP-2)
 * คำนวณต้นทุนเที่ยวรถ = ค่าน้ำมันประเมิน (estimated_fuel_cost_sat) + ค่าใช้จ่ายผูกทริป (ref_type='trip')
 * และคำนวณกำไรเบื้องต้น (profitSat = revenueSat - fuelCostSat - extraExpensesSat)
 */
export function getTripCosting(tripId) {
  const trip = repo.findTripWithDetailsById(tripId);
  if (!trip) {
    throw AppError.notFound(`ไม่พบข้อมูลทริปจัดส่งรหัส ID ${tripId}`);
  }

  const linkedExpenseRows = repo.listTripLinkedExpenses(trip.id, trip.code);
  const linkedExpenses = linkedExpenseRows.map(mapExpenseRow);

  const revenueSat = Number(trip.total_revenue_sat ?? 0);
  const fuelCostSat = Number(trip.estimated_fuel_cost_sat ?? 0);
  const extraExpensesSat = linkedExpenses.reduce((sum, exp) => sum + Number(exp.amountSat ?? 0), 0);
  const totalCostSat = fuelCostSat + extraExpensesSat;
  const profitSat = revenueSat - fuelCostSat - extraExpensesSat;
  const marginPercent =
    revenueSat > 0 ? Math.round((profitSat / revenueSat) * 10000) / 100 : 0;

  return {
    tripId: trip.id,
    tripCode: trip.code,
    tripDate: trip.trip_date,
    status: trip.status,
    vehicle: trip.vehicle_id
      ? {
          id: trip.vehicle_id,
          plate: trip.vehicle_plate,
          plateNo: trip.vehicle_plate,
          name: trip.vehicle_name,
        }
      : null,
    driver: trip.driver_id
      ? {
          id: trip.driver_id,
          code: trip.driver_code,
          name: trip.driver_name,
        }
      : null,
    stopsCount: Number(trip.stops_count ?? 0),
    totalDistanceKm: Number(trip.total_distance_km ?? 0),
    total189L: Number(trip.total_189l ?? 0),
    totalPacks: Number(trip.total_packs ?? 0),
    revenueSat,
    fuelCostSat,
    extraExpensesSat,
    totalCostSat,
    profitSat,
    marginPercent,
    linkedExpenses,
  };
}
