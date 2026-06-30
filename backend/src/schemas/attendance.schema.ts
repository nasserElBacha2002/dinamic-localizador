import { z } from "zod";
import { dateRangeSchema, paginationQuerySchema } from "./common.schema";

const validationStatusSchema = z.enum(["VALID", "PENDING_REVIEW", "REJECTED"]);
const locationStatusSchema = z.enum([
  "INSIDE_GEOFENCE",
  "OUTSIDE_GEOFENCE",
  "INVALID_LOCATION",
]);
const punctualityStatusSchema = z.enum([
  "EARLY",
  "ON_TIME",
  "LATE",
  "OUTSIDE_TIME_WINDOW",
]);

export const createAttendanceSchema = z.object({
  inventoryId: z.string().uuid("UUID de inventario inválido"),
  employeeId: z.string().uuid("UUID de empleado inválido"),
  receivedLatitude: z.number().min(-90).max(90),
  receivedLongitude: z.number().min(-180).max(180),
  distanceMeters: z.number().min(0),
  validationStatus: validationStatusSchema,
  locationStatus: locationStatusSchema,
  punctualityStatus: punctualityStatusSchema,
  receivedAt: z.string().datetime({ offset: true }),
  sourceMessageSid: z.string().trim().max(100).nullable().optional(),
  validationReason: z.string().trim().max(500).nullable().optional(),
});

export const attendanceIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const listAttendanceQuerySchema = paginationQuerySchema.merge(dateRangeSchema).extend({
  inventoryId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  validationStatus: validationStatusSchema.optional(),
  locationStatus: locationStatusSchema.optional(),
  punctualityStatus: punctualityStatusSchema.optional(),
  includeSimulation: z.coerce.boolean().optional(),
  simulationOnly: z.coerce.boolean().optional(),
});

export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
