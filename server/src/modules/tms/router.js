import { Router } from 'express';
import { audit, setAuditContext } from '../../middleware/audit.js';
import { requireAuth } from '../../middleware/auth.js';
import { ROLES, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  createTripBodySchema,
  listTripsQuerySchema,
  optimizeRouteBodySchema,
  tmsPlanQuerySchema,
  tripIdParamSchema,
  updateTripStopsBodySchema,
} from './schema.js';
import * as service from './service.js';

const STAFF_PLUS_ROLES = /** @type {const} */ (['admin', 'manager', 'staff']);
const DRIVER_PLUS_ROLES = /** @type {const} */ (['admin', 'manager', 'staff', 'driver']);

const router = Router();

router.get(
  '/vehicles',
  requireAuth,
  requireRole(...ROLES),
  (_req, res, next) => {
    try {
      const result = service.listVehicles();
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/drivers',
  requireAuth,
  requireRole(...ROLES),
  (_req, res, next) => {
    try {
      const result = service.listDrivers();
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/plan',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: tmsPlanQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.getTmsPlan(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/optimize',
  requireAuth,
  requireRole(...ROLES),
  validate({ body: optimizeRouteBodySchema }),
  (req, res, next) => {
    try {
      const result = service.optimizeRoute(req.body);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/trips',
  requireAuth,
  requireRole(...ROLES),
  validate({ query: listTripsQuerySchema }),
  (req, res, next) => {
    try {
      const result = service.listTrips(req.query);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/trips',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('TMS_CREATE_TRIP', 'trips'),
  validate({ body: createTripBodySchema }),
  (req, res, next) => {
    try {
      const trip = service.createTrip(req.body);
      setAuditContext(res, {
        entityId: String(trip.id),
        detail: `สร้างทริป ${trip.code} (${trip.tripDate}, ${trip.stopsCount} ป้าย, ${trip.totalDistanceKm} กม., 18.9L=${trip.total189L}, แพ็ค=${trip.totalPacks})`,
      });
      return res.status(201).json(trip);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/trips/:id',
  requireAuth,
  requireRole(...ROLES),
  validate({ params: tripIdParamSchema }),
  (req, res, next) => {
    try {
      const trip = service.getTripById(req.params.id);
      return res.json(trip);
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/trips/:id/stops',
  requireAuth,
  requireRole(...STAFF_PLUS_ROLES),
  audit('TMS_REORDER_STOPS', 'trips'),
  validate({ params: tripIdParamSchema, body: updateTripStopsBodySchema }),
  (req, res, next) => {
    try {
      const trip = service.updateTripStops(req.params.id, req.body);
      setAuditContext(res, {
        entityId: String(trip.id),
        detail: `จัดลำดับจุดจอดทริป ${trip.code} ใหม่ (${trip.stopsCount} ป้าย, ระยะทางรวม ${trip.totalDistanceKm} กม., เวลา ${trip.estimatedTimeMin} นาที)`,
      });
      return res.json(trip);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/trips/:id/complete',
  requireAuth,
  requireRole(...DRIVER_PLUS_ROLES),
  audit('TMS_COMPLETE_TRIP', 'trips'),
  validate({ params: tripIdParamSchema }),
  (req, res, next) => {
    try {
      const trip = service.completeTrip(req.params.id);
      setAuditContext(res, {
        entityId: String(trip.id),
        detail: `ปิดทริป ${trip.code} สำเร็จ (ผูก check-in ${trip.linkedCheckins ?? 0} รายการ)`,
      });
      return res.json(trip);
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
