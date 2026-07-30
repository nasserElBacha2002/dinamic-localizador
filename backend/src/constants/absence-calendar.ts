/** Absence day-counting domain constants (Phase 2). */

export const ABSENCE_DAY_COUNTING_MODES = ["CALENDAR_DAYS", "BUSINESS_DAYS"] as const;
export type AbsenceDayCountingMode = (typeof ABSENCE_DAY_COUNTING_MODES)[number];

export const ABSENCE_CALENDAR_DATE_TYPES = [
  "HOLIDAY",
  "NON_WORKING_DAY",
  "WORKING_DAY_OVERRIDE",
  "COMPANY_EVENT",
] as const;
export type AbsenceCalendarDateType = (typeof ABSENCE_CALENDAR_DATE_TYPES)[number];

/** Inclusive max calendar span for a single absence request. */
export const ABSENCE_MAX_RANGE_CALENDAR_DAYS = 366;

/** Snapshot version written on new/edited requests using the advanced calculator. */
export const ABSENCE_CALCULATION_VERSION = 2;

/** Marker for historical rows without a snapshot. */
export const ABSENCE_CALCULATION_VERSION_LEGACY = 1;
