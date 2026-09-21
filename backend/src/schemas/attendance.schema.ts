import { z } from "zod";
import { dateRangeSchema, paginationQuerySchema } from "./common.schema";
import { mergeLegacySingularId, assertWithinMultiFilterLimit, uuidIdListSchema } from "./uuid-id-list";

const validationStatusSchema = z.enum(["VALID", "PENDING_REVIEW", "REJECTED"]);
const locationStatusSchema = z.enum([
  "INSIDE_GEOFENCE",
  "OUTSIDE_GEOFENCE",
  "INVALID_LOCATION",
  "NOT_RECORDED",
]);
const punctualityStatusSchema = z.enum([
  "EARLY",
  "ON_TIME",
  "LATE",
  "OUTSIDE_TIME_WINDOW",
  "NOT_RECORDED",
]);

/**
 * Legacy client-derived fields (pre–Phase 4A).
 *
 * Compatibility window: accept these keys so old frontend builds do not break,
 * but IGNORE them completely — server recomputes authoritative state.
 *
 * Deprecation plan: after all clients migrate, reject via `.strict()` in a
 * dedicated deprecation phase (not 4A). Never persist client-supplied values.
 */
const legacyDerivedAttendanceFieldsSchema = z.object({
  distanceMeters: z.number().optional(),
  validationStatus: validationStatusSchema.optional(),
  locationStatus: locationStatusSchema.optional(),
  punctualityStatus: punctualityStatusSchema.optional(),
  validationReason: z.string().nullable().optional(),
});

/**
 * Client may supply location evidence + optional client-reported receivedAt.
 * Derived fields are accepted-then-stripped; punctuality uses server clock.
 */
export const createAttendanceSchema = z
  .object({
    operationId: z.string().uuid("UUID de operación inválido"),
    employeeId: z.string().uuid("UUID de empleado inválido"),
    receivedLatitude: z.number().min(-90).max(90),
    receivedLongitude: z.number().min(-180).max(180),
    /**
     * Client-reported timestamp kept as non-trusted evidence only.
     * Authoritative punctuality uses server time at create (see attendance.service).
     */
    receivedAt: z.string().datetime({ offset: true }),
    sourceMessageSid: z.string().trim().max(100).nullable().optional(),
  })
  .merge(legacyDerivedAttendanceFieldsSchema)
  .transform((value) => {
    const hasLegacy =
      value.distanceMeters !== undefined ||
      value.validationStatus !== undefined ||
      value.locationStatus !== undefined ||
      value.punctualityStatus !== undefined ||
      value.validationReason !== undefined;

    if (hasLegacy) {
      // Sanitized metric only — no PII / no field values.
      console.info("[attendance] legacy_derived_fields_ignored", {
        event: "attendance.create.legacy_derived_fields_ignored",
      });
    }

    const {
      distanceMeters: _distanceMeters,
      validationStatus: _validationStatus,
      locationStatus: _locationStatus,
      punctualityStatus: _punctualityStatus,
      validationReason: _validationReason,
      ...safe
    } = value;
    return safe;
  });

/** Server-computed fields persisted after authoritative evaluation. */
export type AttendanceValidationDecision = {
  distanceMeters: number;
  validationStatus: z.infer<typeof validationStatusSchema>;
  locationStatus: z.infer<typeof locationStatusSchema>;
  punctualityStatus: z.infer<typeof punctualityStatusSchema>;
  validationReason: string;
};

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
  /** Filter by operation_workdays.operation_shift_id via employee_workday. */
  operationShiftId: z.string().uuid().optional(),
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

/** Persist shape after server-side validation (HTTP create, WhatsApp, simulation). */
export type AttendanceCreatePersistInput = CreateAttendanceInput & {
  employeeWorkdayId: string;
  distanceMeters: number;
  validationStatus: z.infer<typeof validationStatusSchema>;
  locationStatus: z.infer<typeof locationStatusSchema>;
  punctualityStatus: z.infer<typeof punctualityStatusSchema>;
  validationReason: string | null;
  isSimulation?: boolean;
  simulationSessionId?: string | null;
};

/** Detect whether a raw body still carries deprecated derived fields (logging only). */
export function attendancePayloadHasLegacyDerivedFields(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const record = body as Record<string, unknown>;
  return (
    record.distanceMeters !== undefined ||
    record.validationStatus !== undefined ||
    record.locationStatus !== undefined ||
    record.punctualityStatus !== undefined ||
    record.validationReason !== undefined
  );
}
