import type { AbsenceCalendarDateType } from "../constants/absence-calendar";

/**
 * One calendar day in an absence duration breakdown.
 * Shared contract between duration calculation and year allocation helpers.
 */
export type AbsenceDayBreakdownItem = {
  date: string;
  counted: number;
  isWorkingDay: boolean;
  reason: "WORKING" | "WEEKEND" | "HOLIDAY" | "NON_WORKING" | "OVERRIDE_WORKING" | "PARTIAL";
  label?: string;
};

export type { AbsenceCalendarDateType };
