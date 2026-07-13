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

export const STATISTICS_OPERATION_KIND_VALUES = ["", "ONE_TIME", "RECURRING"] as const;

export const STATISTICS_EFFECTIVE_STATE_VALUES = [
  "",
  "EXPECTED",
  "JUSTIFIED",
  "PRESENT",
  "ABSENT",
  "CANCELLED",
] as const;

export const STATISTICS_EMPLOYEE_SORT_FIELDS = [
  "employeeName",
  "phoneNumber",
  "scheduledWorkdays",
  "presentWorkdays",
  "absentWorkdays",
  "justifiedWorkdays",
  "expectedOpenWorkdays",
  "attendanceRate",
  "onTimeWorkdays",
  "lateWorkdays",
  "punctualityRate",
  "workedMinutes",
  "overtimeMinutes",
  "earlyDepartureWorkdays",
  "lastAttendanceDate",
] as const;

export const STATISTICS_OPERATION_SORT_FIELDS = [
  "serviceName",
  "scheduledStart",
  "operationKind",
  "scheduledWorkdays",
  "presentWorkdays",
  "absentWorkdays",
  "justifiedWorkdays",
  "expectedOpenWorkdays",
  "attendanceRate",
  "punctualityRate",
  "workedMinutes",
  "overtimeMinutes",
  "operationalStatus",
] as const;

export const STATISTICS_LOCATION_SORT_FIELDS = [
  "serviceName",
  "address",
  "totalOperations",
  "scheduledWorkdays",
  "presentWorkdays",
  "absentWorkdays",
  "justifiedWorkdays",
  "expectedOpenWorkdays",
  "attendanceRate",
  "punctualityRate",
  "workedMinutes",
  "overtimeMinutes",
] as const;

export function buildStatisticsTableDefaults(dateFields: DateRangeUrlFields) {
  return {
    tab: "general" as StatisticsTabKey,
    operationId: "",
    serviceId: "",
    employeeId: "",
    operationKind: "",
    effectiveState: "",
    validationStatus: "",
    locationStatus: "",
    punctualityStatus: "",
    ...dateFields,
    empPage: 1,
    empPageSize: 10,
    opPage: 1,
    opPageSize: 10,
    svcPage: 1,
    svcPageSize: 10,
    empSortBy: "attendanceRate",
    empSortOrder: "desc" as SortOrder,
    opSortBy: "scheduledStart",
    opSortOrder: "desc" as SortOrder,
    svcSortBy: "attendanceRate",
    svcSortOrder: "desc" as SortOrder,
  };
}

export const STATISTICS_TABLE_FIELDS = {
  tab: { type: "enum", values: STATISTICS_TAB_VALUES },
  operationKind: { type: "enum", values: STATISTICS_OPERATION_KIND_VALUES },
  effectiveState: { type: "enum", values: STATISTICS_EFFECTIVE_STATE_VALUES },
  validationStatus: { type: "enum", values: STATISTICS_VALIDATION_STATUS_VALUES },
  locationStatus: { type: "enum", values: STATISTICS_LOCATION_STATUS_VALUES },
  punctualityStatus: { type: "enum", values: STATISTICS_PUNCTUALITY_STATUS_VALUES },
  empPage: { type: "number", min: 1, resetPageOnChange: false },
  empPageSize: { type: "number", min: 1, resetPageOnChange: false },
  opPage: { type: "number", min: 1, resetPageOnChange: false },
  opPageSize: { type: "number", min: 1, resetPageOnChange: false },
  svcPage: { type: "number", min: 1, resetPageOnChange: false },
  svcPageSize: { type: "number", min: 1, resetPageOnChange: false },
  empSortBy: { type: "enum", values: STATISTICS_EMPLOYEE_SORT_FIELDS },
  opSortBy: { type: "enum", values: STATISTICS_OPERATION_SORT_FIELDS },
  svcSortBy: { type: "enum", values: STATISTICS_LOCATION_SORT_FIELDS },
  empSortOrder: { type: "enum", values: ["asc", "desc"] },
  opSortOrder: { type: "enum", values: ["asc", "desc"] },
  svcSortOrder: { type: "enum", values: ["asc", "desc"] },
} satisfies TableUrlFieldMap<ReturnType<typeof buildStatisticsTableDefaults>>;
