import type { SortOrder, TableUrlFieldMap } from "../../utils/table-url-state";
import type { DateRangeUrlFields } from "../../utils/date-range-url";

export type StatisticsTabKey = "general" | "employee" | "operation" | "location";

export const STATISTICS_TAB_VALUES = ["general", "employee", "operation", "location"] as const;

export const STATISTICS_VALIDATION_STATUS_VALUES = [
  "",
  "VALID",
  "PENDING_REVIEW",
  "REJECTED",
  "NO_CHECK_IN",
] as const;

export const STATISTICS_LOCATION_STATUS_VALUES = [
  "",
  "INSIDE_GEOFENCE",
  "OUTSIDE_GEOFENCE",
  "INVALID_LOCATION",
] as const;

export const STATISTICS_PUNCTUALITY_STATUS_VALUES = [
  "",
  "EARLY",
  "ON_TIME",
  "LATE",
  "OUTSIDE_TIME_WINDOW",
] as const;

export const STATISTICS_EMPLOYEE_SORT_FIELDS = [
  "employeeName",
  "phoneNumber",
  "assignedOperationsCount",
  "confirmedAttendances",
  "noShowCount",
  "lateCount",
  "outsideGeofenceCount",
  "pendingReviewCount",
  "attendancePercentage",
  "lastAttendanceDate",
] as const;

export const STATISTICS_INVENTORY_SORT_FIELDS = [
  "serviceName",
  "scheduledStart",
  "assignedEmployeesCount",
  "presentCount",
  "noShowCount",
  "lateCount",
  "outsideGeofenceCount",
  "pendingReviewCount",
  "attendancePercentage",
  "operationalStatus",
] as const;

export const STATISTICS_LOCATION_SORT_FIELDS = [
  "serviceName",
  "address",
  "totalOperations",
  "averageAttendancePercentage",
  "totalAssignedEmployees",
  "totalConfirmedAttendances",
  "totalNoShows",
  "totalLateRecords",
  "totalOutsideGeofenceRecords",
  "totalManualReviews",
] as const;

export function buildStatisticsTableDefaults(dateFields: DateRangeUrlFields) {
  return {
    tab: "general" as StatisticsTabKey,
    operationId: "",
    serviceId: "",
    employeeId: "",
    validationStatus: "",
    locationStatus: "",
    punctualityStatus: "",
    ...dateFields,
    empPage: 1,
    empPageSize: 10,
    invPage: 1,
    invPageSize: 10,
    locPage: 1,
    locPageSize: 10,
    empSortBy: "attendancePercentage",
    empSortOrder: "desc" as SortOrder,
    invSortBy: "scheduledStart",
    invSortOrder: "desc" as SortOrder,
    locSortBy: "averageAttendancePercentage",
    locSortOrder: "desc" as SortOrder,
  };
}

export const STATISTICS_TABLE_FIELDS = {
  tab: { type: "enum", values: STATISTICS_TAB_VALUES },
  validationStatus: { type: "enum", values: STATISTICS_VALIDATION_STATUS_VALUES },
  locationStatus: { type: "enum", values: STATISTICS_LOCATION_STATUS_VALUES },
  punctualityStatus: { type: "enum", values: STATISTICS_PUNCTUALITY_STATUS_VALUES },
  empPage: { type: "number", min: 1, resetPageOnChange: false },
  empPageSize: { type: "number", min: 1, resetPageOnChange: false },
  invPage: { type: "number", min: 1, resetPageOnChange: false },
  invPageSize: { type: "number", min: 1, resetPageOnChange: false },
  locPage: { type: "number", min: 1, resetPageOnChange: false },
  locPageSize: { type: "number", min: 1, resetPageOnChange: false },
  empSortBy: { type: "enum", values: STATISTICS_EMPLOYEE_SORT_FIELDS },
  invSortBy: { type: "enum", values: STATISTICS_INVENTORY_SORT_FIELDS },
  locSortBy: { type: "enum", values: STATISTICS_LOCATION_SORT_FIELDS },
  empSortOrder: { type: "enum", values: ["asc", "desc"] },
  invSortOrder: { type: "enum", values: ["asc", "desc"] },
  locSortOrder: { type: "enum", values: ["asc", "desc"] },
} satisfies TableUrlFieldMap<ReturnType<typeof buildStatisticsTableDefaults>>;
