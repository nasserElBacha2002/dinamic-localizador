import { DateTime } from "luxon";
import type {
  OperationShiftDateException,
  OperationShiftVersion,
} from "../types/operation-shift";
import { buildRecurringExpectedInstants } from "./recurring-workday-instant";

export type ResolvedShiftScheduleForDate = {
  startTime: string;
  endTime: string;
  cancelled: boolean;
  expectedStartAt: Date;
  expectedEndAt: Date;
};

/**
 * Picks the version whose inclusive effective range covers workDate.
 * Returns null when none match. Caller should treat multiple matches as data error
 * (DB overlap guard + findEffectiveForDate enforce uniqueness).
 */
export const resolveVersionForDate = (
  versions: readonly OperationShiftVersion[],
  workDate: string,
): OperationShiftVersion | null => {
  const matches = versions.filter((version) => {
    if (version.effectiveFrom > workDate) {
      return false;
    }
    if (version.effectiveUntil != null && workDate > version.effectiveUntil) {
      return false;
    }
    return true;
  });

  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    // Deterministic pick: latest effectiveFrom (should not happen under overlap guard).
    return [...matches].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]!;
  }
  return matches[0]!;
};

/**
 * ISO weekday 1=Mon … 7=Sun in the operation timezone for the calendar workDate.
 */
export const isDayEnabled = (
  version: OperationShiftVersion,
  workDate: string,
  timezone: string,
): boolean => {
  const local = DateTime.fromISO(workDate, { zone: timezone });
  if (!local.isValid) {
    return false;
  }
  const isoWeekday = local.weekday; // Luxon: 1=Mon … 7=Sun
  const day = version.days.find((entry) => entry.dayOfWeek === isoWeekday);
  if (!day) {
    // Missing day row → treat as disabled (insufficient evidence).
    return false;
  }
  return day.isEnabled;
};

/**
 * Precedence: exception CANCEL > TIME_OVERRIDE > version (RESTORE / absent).
 */
export const resolveShiftScheduleForDate = (input: {
  version: OperationShiftVersion;
  exception: OperationShiftDateException | null;
  workDate: string;
  timezone: string;
}): ResolvedShiftScheduleForDate => {
  const { version, exception, workDate, timezone } = input;

  let startTime = version.startTime;
  let endTime = version.endTime;
  let cancelled = false;

  if (exception?.exceptionKind === "CANCEL") {
    cancelled = true;
  } else if (
    exception?.exceptionKind === "TIME_OVERRIDE" &&
    exception.startTime &&
    exception.endTime
  ) {
    startTime = exception.startTime;
    endTime = exception.endTime;
  }
  // RESTORE (or null): use version times, not cancelled.

  const { expectedStartAt, expectedEndAt } = buildRecurringExpectedInstants({
    workDate,
    startTime,
    endTime,
    timezone,
  });

  return {
    startTime,
    endTime,
    cancelled,
    expectedStartAt,
    expectedEndAt,
  };
};
