import { z } from "zod";
import { dateRangeSchema, paginationQuerySchema } from "./common.schema";
import { mergeLegacySingularId, assertWithinMultiFilterLimit, uuidIdListSchema } from "./uuid-id-list";

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
  operationId: z.string().uuid("UUID de operación inválido"),
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
  operationId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  operationIds: uuidIdListSchema.optional(),
  employeeIds: uuidIdListSchema.optional(),
  serviceIds: uuidIdListSchema.optional(),
  validationStatus: validationStatusSchema.optional(),
  locationStatus: locationStatusSchema.optional(),
  punctualityStatus: punctualityStatusSchema.optional(),
  checkoutStatus: z
    .enum([
      "CHECKOUT_VALID",
      "CHECKOUT_EARLY_WITHIN_TOLERANCE",
      "CHECKOUT_EARLY_REVIEW",
      "CHECKOUT_LATE_EXTRA_TIME",
      "CHECKOUT_LOCATION_REVIEW",
      "CHECKOUT_REJECTED",
    ])
    .optional(),
  openAttendance: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  includeSimulation: z.coerce.boolean().optional(),
  simulationOnly: z.coerce.boolean().optional(),
}).transform((query) => ({
  ...query,
  operationIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.operationIds ?? [], query.operationId),
  ),
  employeeIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.employeeIds ?? [], query.employeeId),
  ),
  serviceIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.serviceIds ?? [], query.serviceId),
  ),
}));

export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
