import { DateTime } from "luxon";
import {
  ABSENCE_PARTIAL_DAY_BOUNDARY_HOUR,
  ABSENCE_PARTIAL_DAY_BOUNDARY_TIME,
} from "../constants/absence-day-period";
import type { AbsenceDayPeriod } from "../types/absence";
import { compareAbsenceDates } from "./absence-date";

export interface AbsenceCoverageInput {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
  reviewedAt: string | null;
  createdAt: string;
}

export interface WorkdayAbsenceScheduleContext {
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  scheduleTimezone: string;
}

type IntervalMs = { startMs: number; endMs: number };

const compareAbsenceOrdering = (left: AbsenceCoverageInput, right: AbsenceCoverageInput): number => {
  const reviewedLeft = left.reviewedAt ?? "";
  const reviewedRight = right.reviewedAt ?? "";
  if (reviewedLeft !== reviewedRight) {
    return reviewedLeft < reviewedRight ? -1 : 1;
  }
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

const intervalsOverlap = (left: IntervalMs, right: IntervalMs): boolean =>
  left.startMs < right.endMs && right.startMs < left.endMs;

export const getCalendarDatesSpannedByWorkInterval = (
  expectedStartAt: string,
  expectedEndAt: string | null,
  timezone: string,
): string[] => {
  const start = DateTime.fromISO(expectedStartAt, { zone: "utc" }).setZone(timezone);
  const end = expectedEndAt
    ? DateTime.fromISO(expectedEndAt, { zone: "utc" }).setZone(timezone)
    : start;

  const dates = new Set<string>();
  let cursor = start.startOf("day");
  const lastDay = end.startOf("day");

  while (cursor <= lastDay) {
    dates.add(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
  }

  return [...dates].sort();
};

const resolvePeriodForCalendarDay = (
  absence: Pick<AbsenceCoverageInput, "startDate" | "endDate" | "startPeriod" | "endPeriod">,
  calendarDate: string,
): AbsenceDayPeriod | null => {
  if (compareAbsenceDates(calendarDate, absence.startDate) < 0) {
    return null;
  }
  if (compareAbsenceDates(calendarDate, absence.endDate) > 0) {
    return null;
  }

  if (absence.startDate === absence.endDate) {
    if (absence.startPeriod === "FULL_DAY" && absence.endPeriod === "FULL_DAY") {
      return "FULL_DAY";
    }
    if (absence.startPeriod === absence.endPeriod) {
      return absence.startPeriod;
    }
    if (absence.startPeriod === "AM" && absence.endPeriod === "PM") {
      return "FULL_DAY";
    }
    return absence.startPeriod;
  }

  if (calendarDate === absence.startDate) {
    return absence.startPeriod === "PM" ? "PM" : "FULL_DAY";
  }
  if (calendarDate === absence.endDate) {
    return absence.endPeriod === "AM" ? "AM" : "FULL_DAY";
  }

  return "FULL_DAY";
};

const buildLocalDayInterval = (
  calendarDate: string,
  period: AbsenceDayPeriod,
  timezone: string,
): IntervalMs | null => {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const dayStart = DateTime.fromObject({ year, month, day, hour: 0, minute: 0 }, { zone: timezone });
  if (!dayStart.isValid) {
    return null;
  }

  if (period === "FULL_DAY") {
    const dayEnd = dayStart.plus({ days: 1 });
    return { startMs: dayStart.toUTC().toMillis(), endMs: dayEnd.toUTC().toMillis() };
  }

  if (period === "AM") {
    const amEnd = dayStart.set({
      hour: ABSENCE_PARTIAL_DAY_BOUNDARY_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    return { startMs: dayStart.toUTC().toMillis(), endMs: amEnd.toUTC().toMillis() };
  }

  const pmStart = dayStart.set({
    hour: ABSENCE_PARTIAL_DAY_BOUNDARY_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const pmEnd = dayStart.plus({ days: 1 });
  return { startMs: pmStart.toUTC().toMillis(), endMs: pmEnd.toUTC().toMillis() };
};

const buildWorkInterval = (workday: WorkdayAbsenceScheduleContext): IntervalMs => {
  const startMs = new Date(workday.expectedStartAt).getTime();
  const endMs = workday.expectedEndAt
    ? new Date(workday.expectedEndAt).getTime()
    : startMs;
  return { startMs, endMs: Math.max(endMs, startMs) };
};

/**
 * Returns true when the scheduled work interval overlaps the effective absence interval.
 * Uses operational timezone and half-open interval overlap semantics.
 */
export const isWorkdayCoveredByAbsence = (
  workday: WorkdayAbsenceScheduleContext,
  absence: AbsenceCoverageInput,
): boolean => {
  const workInterval = buildWorkInterval(workday);
  const spannedDates = getCalendarDatesSpannedByWorkInterval(
    workday.expectedStartAt,
    workday.expectedEndAt,
    workday.scheduleTimezone,
  );

  for (const calendarDate of spannedDates) {
    const period = resolvePeriodForCalendarDay(absence, calendarDate);
    if (!period) {
      continue;
    }

    const absenceInterval = buildLocalDayInterval(calendarDate, period, workday.scheduleTimezone);
    if (absenceInterval && intervalsOverlap(workInterval, absenceInterval)) {
      return true;
    }
  }

  return false;
};

export const resolveEffectiveAbsenceForWorkday = <T extends AbsenceCoverageInput>(input: {
  workday: WorkdayAbsenceScheduleContext;
  approvedAbsences: T[];
}): T | null => {
  const covering = input.approvedAbsences
    .filter((absence) => isWorkdayCoveredByAbsence(input.workday, absence))
    .sort(compareAbsenceOrdering);

  return covering[0] ?? null;
};

export const getAbsenceDateRangeForWorkday = (
  workday: WorkdayAbsenceScheduleContext,
): { dateFrom: string; dateTo: string } => {
  const spannedDates = getCalendarDatesSpannedByWorkInterval(
    workday.expectedStartAt,
    workday.expectedEndAt,
    workday.scheduleTimezone,
  );
  const sorted = [workday.workDate, ...spannedDates].sort();
  return {
    dateFrom: sorted[0]!,
    dateTo: sorted[sorted.length - 1]!,
  };
};

export const absenceDayPeriodBoundaryLabel = (): string =>
  `${ABSENCE_PARTIAL_DAY_BOUNDARY_TIME} (${ABSENCE_PARTIAL_DAY_BOUNDARY_HOUR}:00 local)`;
