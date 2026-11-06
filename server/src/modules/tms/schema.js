import { z } from 'zod';

export const TRIP_STATUSES = Object.freeze(['planned', 'in_progress', 'completed', 'cancelled']);

export const tripIdParamSchema = z.object({
  id: z.coerce.number().int().positive('รหัสทริป (id) ต้องเป็นจำนวนเต็มบวก'),
});

export const tmsPlanQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD')
    .optional(),
  zone: z.string().trim().max(100).optional(),
});

const stopCoordinateInputSchema = z
  .object({
    customerId: z.coerce.number().int().positive().optional(),
    customer_id: z.coerce.number().int().positive().optional(),
    lat: z.coerce.number().min(-90).max(90).nullable().optional(),
    lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  })
  .passthrough();

export const optimizeRouteBodySchema = z.object({
  start: z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      name: z.string().trim().optional(),
    })
    .optional(),
  stops: z.array(stopCoordinateInputSchema).default([]),
});

const plannedQuantitiesSchema = z
  .object({
    'FG-189L': z.coerce.number().int().min(0).optional(),
    'FG-350ML': z.coerce.number().int().min(0).optional(),
    'FG-600ML': z.coerce.number().int().min(0).optional(),
    'FG-1500ML': z.coerce.number().int().min(0).optional(),
    qty189L: z.coerce.number().int().min(0).optional(),
    qty350ML: z.coerce.number().int().min(0).optional(),
    qty600ML: z.coerce.number().int().min(0).optional(),
    qty1500ML: z.coerce.number().int().min(0).optional(),
    totalSat: z.coerce.number().int().min(0).optional(),
  })
  .passthrough()
  .optional();

export const tripStopInputSchema = z
  .object({
    customerId: z.coerce.number().int().positive('รหัสลูกค้า (customerId) ต้องเป็นจำนวนเต็มบวก'),
    seq: z.coerce.number().int().min(1).optional(),
    planned: plannedQuantitiesSchema,
    quantities: plannedQuantitiesSchema,
  })
  .passthrough();

export const createTripBodySchema = z.object({
  vehicleId: z.coerce.number().int().positive().nullable().optional(),
  driverId: z.coerce.number().int().positive().nullable().optional(),
  tripDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ออกรถ (tripDate) ต้องเป็น YYYY-MM-DD')
    .optional(),
  departedTime: z.string().trim().max(20).nullable().optional(),
  stops: z.array(tripStopInputSchema).min(1, 'ต้องมีจุดจอดอย่างน้อย 1 จุด'),
});

export const updateTripStopsBodySchema = z.object({
  stops: z.array(tripStopInputSchema).min(1, 'ต้องมีจุดจอดอย่างน้อย 1 จุด'),
});

export const listTripsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  driverId: z.coerce.number().int().positive().optional(),
  status: z.enum(TRIP_STATUSES).optional(),
});
