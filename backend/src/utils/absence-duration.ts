import type { AbsenceDayPeriod } from "../types/absence";
import type { AbsenceCalendarDateType, AbsenceDayCountingMode } from "../constants/absence-calendar";
import { ABSENCE_MAX_RANGE_CALENDAR_DAYS } from "../constants/absence-calendar";
import { isoWeekdayFromDateIso, type WeekdayNumber } from "../constants/weekday";
import {
  compareAbsenceDates,
  parseAbsenceDateInput,
} from "./absence-date";

export type CalendarWeekdayRule = {
  dayOfWeek: WeekdayNumber;
  isWorkingDay: boolean;
};

export type CalendarDateException = {
  date: string;
  name: string;
  dateType: AbsenceCalendarDateType;
  isWorkingDay: boolean;
};

export type AbsenceDayBreakdownItem = {
  date: string;
  counted: number;
  isWorkingDay: boolean;
  reason: "WORKING" | "WEEKEND" | "HOLIDAY" | "NON_WORKING" | "OVERRIDE_WORKING" | "PARTIAL";
  label?: string;
};

export type AbsenceDurationCalculation = {
  totalDays: number;
  countingMode: AbsenceDayCountingMode;
  calendarDays: number;
  workingDays: number;
  nonWorkingDays: number;
  holidayDays: number;
  partialDays: number;
  timezone: string;
  calendarId: string;
  calculationVersion: number;
  breakdown: AbsenceDayBreakdownItem[];
  excludedSummary: string[];
};

const addDaysIso = (iso: string, days: number): string => {
  const parsed = parseAbsenceDateInput(iso);
  if (!parsed) {
    throw new Error("INVALID_ABSENCE_DATE");
  }
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const enumerateDatesInclusive = (startDate: string, endDate: string): string[] => {
  const start = parseAbsenceDateInput(startDate);
  const end = parseAbsenceDateInput(endDate);
  if (!start || !end) {
    throw new Error("INVALID_ABSENCE_DATE");
  }
  if (compareAbsenceDates(start.iso, end.iso) > 0) {
    throw new Error("INVALID_ABSENCE_DATE_RANGE");
  }

  const dates: string[] = [];
  let cursor = start.iso;
  while (compareAbsenceDates(cursor, end.iso) <= 0) {
    dates.push(cursor);
    if (dates.length > ABSENCE_MAX_RANGE_CALENDAR_DAYS) {
      throw new Error("ABSENCE_RANGE_TOO_LONG");
    }
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
};

const fractionForDay = (
  date: string,
  startDate: string,
  endDate: string,
  startPeriod: AbsenceDayPeriod,
  endPeriod: AbsenceDayPeriod,
): number => {
  if (startDate === endDate) {
    if (startPeriod === "FULL_DAY" && endPeriod === "FULL_DAY") {
      return 1;
    }
    if (startPeriod === endPeriod && startPeriod !== "FULL_DAY") {
      return 0.5;
    }
    if (startPeriod === "AM" && endPeriod === "PM") {
      return 1;
    }
    return 0.5;
  }

  if (date === startDate && startPeriod === "PM") {
    return 0.5;
  }
  if (date === endDate && endPeriod === "AM") {
    return 0.5;
  }
  return 1;
};

const resolveWorking = (
  date: string,
  weekdays: Map<WeekdayNumber, boolean>,
  exceptions: Map<string, CalendarDateException>,
): { isWorkingDay: boolean; reason: AbsenceDayBreakdownItem["reason"]; label?: string } => {
  const exception = exceptions.get(date);
  if (exception) {
    if (exception.isWorkingDay) {
      return { isWorkingDay: true, reason: "OVERRIDE_WORKING", label: exception.name };
    }
    if (exception.dateType === "HOLIDAY") {
      return { isWorkingDay: false, reason: "HOLIDAY", label: exception.name };
    }
    return { isWorkingDay: false, reason: "NON_WORKING", label: exception.name };
  }

  const dow = isoWeekdayFromDateIso(date);
  const isWorking = weekdays.get(dow) ?? false;
  if (!isWorking) {
    return { isWorkingDay: false, reason: "WEEKEND" };
  }
  return { isWorkingDay: true, reason: "WORKING" };
};

/**
 * Pure, deterministic absence duration calculator.
 * Callers must load weekday rules and exceptions for the full range beforehand.
 */
export const calculateAbsenceDuration = (input: {
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
  countingMode: AbsenceDayCountingMode;
  timezone: string;
  calendarId: string;
  calculationVersion: number;
  weekdays: CalendarWeekdayRule[];
  exceptions: CalendarDateException[];
}): AbsenceDurationCalculation => {
  const dates = enumerateDatesInclusive(input.startDate, input.endDate);
  const weekdayMap = new Map<WeekdayNumber, boolean>();
  for (const rule of input.weekdays) {
    weekdayMap.set(rule.dayOfWeek, rule.isWorkingDay);
  }
  const exceptionMap = new Map(input.exceptions.map((item) => [item.date, item]));

  const breakdown: AbsenceDayBreakdownItem[] = [];
  let totalDays = 0;
  let workingDays = 0;
  let nonWorkingDays = 0;
  let holidayDays = 0;
  let partialDays = 0;
  const excludedSummary: string[] = [];

  for (const date of dates) {
    const fraction = fractionForDay(
      date,
      input.startDate,
      input.endDate,
      input.startPeriod,
      input.endPeriod,
    );
    const working = resolveWorking(date, weekdayMap, exceptionMap);

    if (input.countingMode === "CALENDAR_DAYS") {
      totalDays += fraction;
      if (fraction < 1) {
        partialDays += fraction;
      }
      if (!working.isWorkingDay) {
        nonWorkingDays += 1;
        if (working.reason === "HOLIDAY") {
          holidayDays += 1;
        }
      } else {
        workingDays += 1;
      }
      breakdown.push({
        date,
        counted: fraction,
        isWorkingDay: working.isWorkingDay,
        reason: fraction < 1 ? "PARTIAL" : working.reason,
        label: working.label,
      });
      continue;
    }

    // BUSINESS_DAYS
    if (!working.isWorkingDay) {
      nonWorkingDays += 1;
      if (working.reason === "HOLIDAY") {
        holidayDays += 1;
      }
      breakdown.push({
        date,
        counted: 0,
        isWorkingDay: false,
        reason: working.reason,
        label: working.label,
      });
      const label = working.label ?? (working.reason === "WEEKEND" ? date : date);
      excludedSummary.push(label);
      continue;
    }

    totalDays += fraction;
    workingDays += 1;
    if (fraction < 1) {
      partialDays += fraction;
    }
    breakdown.push({
      date,
      counted: fraction,
      isWorkingDay: true,
      reason: fraction < 1 ? "PARTIAL" : working.reason,
      label: working.label,
    });
  }

  // Round to 1 decimal to match DECIMAL(5,1) storage.
  totalDays = Math.round(totalDays * 10) / 10;
  partialDays = Math.round(partialDays * 10) / 10;

  return {
    totalDays,
    countingMode: input.countingMode,
    calendarDays: dates.length,
    workingDays,
    nonWorkingDays,
    holidayDays,
    partialDays,
    timezone: input.timezone,
    calendarId: input.calendarId,
    calculationVersion: input.calculationVersion,
    breakdown,
    excludedSummary: [...new Set(excludedSummary)].slice(0, 12),
  };
};
