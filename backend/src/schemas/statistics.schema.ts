import { z } from "zod";
import { OPERATION_KINDS } from "../constants/operation-kind";
import { dateRangeSchema, paginationQuerySchema } from "./common.schema";
import { assertWithinMultiFilterLimit, mergeLegacySingularId, uuidIdListSchema } from "./uuid-id-list";

const validationStatusFilterSchema = z.enum([
  "VALID",
  "PENDING_REVIEW",
  "REJECTED",
  "NO_CHECK_IN",
]);

const locationStatusFilterSchema = z.enum([
  "INSIDE_GEOFENCE",
  "OUTSIDE_GEOFENCE",
  "INVALID_LOCATION",
]);

const punctualityStatusFilterSchema = z.enum([
  "EARLY",
  "ON_TIME",
  "LATE",
  "OUTSIDE_TIME_WINDOW",
]);

const effectiveStateFilterSchema = z.enum([
  "EXPECTED",
  "JUSTIFIED",
  "PRESENT",
  "ABSENT",
  "CANCELLED",
]);

const exportFlagSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const boolFlagSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

/** Explicit ranking modes apply eligibility in SQL before ORDER BY / pagination. */
export const STATISTICS_RANKING_MODES = [
  "attention_employees",
  "late_employees",
  "low_coverage_operations",
  "incident_services",
] as const;

export type StatisticsRankingMode = (typeof STATISTICS_RANKING_MODES)[number];

const mergeMultiIdFilters = <T extends {
  operationId?: string;
  serviceId?: string;
  employeeId?: string;
  operationIds?: string[];
  serviceIds?: string[];
  employeeIds?: string[];
}>(query: T) => ({
  ...query,
  operationIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.operationIds ?? [], query.operationId),
  ),
  serviceIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.serviceIds ?? [], query.serviceId),
  ),
  employeeIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.employeeIds ?? [], query.employeeId),
  ),
});

const statisticsFiltersObjectSchema = dateRangeSchema.extend({
  operationId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  operationIds: uuidIdListSchema.optional(),
  serviceIds: uuidIdListSchema.optional(),
  employeeIds: uuidIdListSchema.optional(),
  operationKind: z.enum(OPERATION_KINDS).optional(),
  effectiveState: effectiveStateFilterSchema.optional(),
  validationStatus: validationStatusFilterSchema.optional(),
  locationStatus: locationStatusFilterSchema.optional(),
  punctualityStatus: punctualityStatusFilterSchema.optional(),
  /** When true, only workdays with open (overdue) check-out. */
  openAttendance: boolFlagSchema,
  /** Table/ranking: only consolidated ops with coverage < 100%. */
  incompleteCoverage: boolFlagSchema,
  rankingMode: z.enum(STATISTICS_RANKING_MODES).optional(),
  export: exportFlagSchema,
});

export const statisticsFiltersSchema = statisticsFiltersObjectSchema.transform(mergeMultiIdFilters);

export const statisticsTableQuerySchema = paginationQuerySchema
  .merge(statisticsFiltersObjectSchema)
  .extend({
    sortBy: z.string().trim().optional(),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .transform(mergeMultiIdFilters);

export type StatisticsFilters = z.infer<typeof statisticsFiltersSchema>;
export type StatisticsTableQuery = z.infer<typeof statisticsTableQuerySchema>;

export const MAX_STATISTICS_EXPORT_ROWS = 10_000;
