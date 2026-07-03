import type { TableUrlFieldMap } from "../../utils/table-url-state";
import { dateRangeToUrlFields } from "../../utils/date-range-url";
import { EMPTY_DATE_RANGE_VALUE } from "../../utils/date-range";

export const ABSENCE_STATUS_VALUES = [
  "all",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "NEEDS_INFO",
] as const;

export type AbsenceListStatusFilter = (typeof ABSENCE_STATUS_VALUES)[number];

export const ABSENCES_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  status: "PENDING",
  absenceTypeId: "",
  employeeId: "",
  ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
};

export const ABSENCES_TABLE_FIELDS = {
  status: { type: "enum", values: ABSENCE_STATUS_VALUES },
} satisfies TableUrlFieldMap<typeof ABSENCES_TABLE_DEFAULTS>;

export const shouldOmitAbsencesTableValue = (
  key: keyof typeof ABSENCES_TABLE_DEFAULTS,
  value: (typeof ABSENCES_TABLE_DEFAULTS)[keyof typeof ABSENCES_TABLE_DEFAULTS],
  defaults: typeof ABSENCES_TABLE_DEFAULTS,
): boolean => value === defaults[key] || value === "";
