import type { TableUrlFieldMap } from "../../utils/table-url-state";
import { dateRangeToUrlFields } from "../../utils/date-range-url";
import { EMPTY_DATE_RANGE_VALUE } from "../../utils/date-range";

export const ATTENDANCE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  operationIds: [] as string[],
  employeeIds: [] as string[],
  serviceIds: [] as string[],
  validationStatus: "",
  locationStatus: "",
  punctualityStatus: "",
  checkoutStatus: "",
  openAttendance: false,
  recordType: "real" as "real" | "simulation" | "all",
  ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
};

export const ATTENDANCE_TABLE_FIELDS = {
  operationIds: { type: "stringList" as const },
  employeeIds: { type: "stringList" as const },
  serviceIds: { type: "stringList" as const },
  recordType: { type: "enum", values: ["real", "simulation", "all"] },
  validationStatus: {
    type: "enum",
    values: ["", "VALID", "PENDING_REVIEW", "REJECTED"],
  },
  locationStatus: {
    type: "enum",
    values: ["", "INSIDE_GEOFENCE", "OUTSIDE_GEOFENCE", "INVALID_LOCATION"],
  },
  punctualityStatus: {
    type: "enum",
    values: ["", "EARLY", "ON_TIME", "LATE", "OUTSIDE_TIME_WINDOW"],
  },
  checkoutStatus: {
    type: "enum",
    values: [
      "",
      "CHECKOUT_VALID",
      "CHECKOUT_EARLY_WITHIN_TOLERANCE",
      "CHECKOUT_EARLY_REVIEW",
      "CHECKOUT_LATE_EXTRA_TIME",
      "CHECKOUT_LOCATION_REVIEW",
      "CHECKOUT_REJECTED",
    ],
  },
  openAttendance: { type: "boolean" as const },
} satisfies TableUrlFieldMap<typeof ATTENDANCE_TABLE_DEFAULTS>;

export const shouldOmitAttendanceTableValue = (
  key: keyof typeof ATTENDANCE_TABLE_DEFAULTS,
  value: (typeof ATTENDANCE_TABLE_DEFAULTS)[keyof typeof ATTENDANCE_TABLE_DEFAULTS],
  defaults: typeof ATTENDANCE_TABLE_DEFAULTS,
): boolean => {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value === defaults[key] || value === "";
};
