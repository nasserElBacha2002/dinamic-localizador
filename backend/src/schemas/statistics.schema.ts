import { z } from "zod";
import { dateRangeSchema, paginationQuerySchema } from "./common.schema";

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

const exportFlagSchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

export const statisticsFiltersSchema = dateRangeSchema.extend({
  inventoryId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  validationStatus: validationStatusFilterSchema.optional(),
  locationStatus: locationStatusFilterSchema.optional(),
  punctualityStatus: punctualityStatusFilterSchema.optional(),
  export: exportFlagSchema,
});

export const statisticsTableQuerySchema = paginationQuerySchema.merge(statisticsFiltersSchema).extend({
  sortBy: z.string().trim().optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export type StatisticsFilters = z.infer<typeof statisticsFiltersSchema>;
export type StatisticsTableQuery = z.infer<typeof statisticsTableQuerySchema>;

export const MAX_STATISTICS_EXPORT_ROWS = 10_000;
