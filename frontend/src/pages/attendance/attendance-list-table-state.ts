import type { TableUrlFieldMap } from "../../utils/table-url-state";
import { dateRangeToUrlFields } from "../../utils/date-range-url";
import { EMPTY_DATE_RANGE_VALUE } from "../../utils/date-range";

export const ATTENDANCE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  inventoryId: "",
  employeeId: "",
  storeId: "",
  validationStatus: "",
  locationStatus: "",
  punctualityStatus: "",
  recordType: "real" as "real" | "simulation" | "all",
  ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
};

export const ATTENDANCE_TABLE_FIELDS = {
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
} satisfies TableUrlFieldMap<typeof ATTENDANCE_TABLE_DEFAULTS>;

export const shouldOmitAttendanceTableValue = (
  key: keyof typeof ATTENDANCE_TABLE_DEFAULTS,
  value: (typeof ATTENDANCE_TABLE_DEFAULTS)[keyof typeof ATTENDANCE_TABLE_DEFAULTS],
  defaults: typeof ATTENDANCE_TABLE_DEFAULTS,
): boolean => value === defaults[key] || value === "";
