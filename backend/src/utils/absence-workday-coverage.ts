import type { AbsenceDayPeriod } from "../types/absence";
import { compareAbsenceDates } from "./absence-date";

export interface AbsenceDateCoverageInput {
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
}

/**
 * Determines whether an approved absence covers a concrete operational work date.
 * Matching is based on the local calendar work date (operation_workdays.work_date).
 */
export const isWorkDateCoveredByAbsence = (
  workDate: string,
  absence: AbsenceDateCoverageInput,
): boolean => {
  if (compareAbsenceDates(workDate, absence.startDate) < 0) {
    return false;
  }
  if (compareAbsenceDates(workDate, absence.endDate) > 0) {
    return false;
  }

  if (workDate === absence.startDate && absence.startPeriod === "PM") {
    return false;
  }

  if (workDate === absence.endDate && absence.endPeriod === "AM") {
    return false;
  }

  return true;
};
