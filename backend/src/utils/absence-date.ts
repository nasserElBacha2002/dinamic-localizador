import type { AbsenceDayPeriod } from "../types/absence";

export interface ParsedAbsenceDate {
  year: number;
  month: number;
  day: number;
  iso: string;
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const formatAbsenceDateDisplay = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

export const parseSpanishDateInput = (raw: string): ParsedAbsenceDate | null => {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const latinMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!latinMatch) {
    return null;
  }

  return normalizeDateParts(Number(latinMatch[3]), Number(latinMatch[2]), Number(latinMatch[1]));
};

export const parseAbsenceDateInput = (raw: string): ParsedAbsenceDate | null => {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return normalizeDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  return parseSpanishDateInput(value);
};

const normalizeDateParts = (
  year: number,
  month: number,
  day: number,
): ParsedAbsenceDate | null => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    iso: `${year}-${pad2(month)}-${pad2(day)}`,
  };
};

export const compareAbsenceDates = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

export const getTodayAbsenceDateIso = (timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
};

export const calculateTotalAbsenceDays = (input: {
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
}): number => {
  const start = parseAbsenceDateInput(input.startDate);
  const end = parseAbsenceDateInput(input.endDate);
  if (!start || !end) {
    throw new Error("Fechas inválidas");
  }

  if (compareAbsenceDates(start.iso, end.iso) > 0) {
    throw new Error("La fecha de inicio no puede ser posterior a la fecha de fin");
  }

  if (start.iso === end.iso) {
    if (input.startPeriod === "FULL_DAY" && input.endPeriod === "FULL_DAY") {
      return 1;
    }
    if (input.startPeriod === input.endPeriod && input.startPeriod !== "FULL_DAY") {
      return 0.5;
    }
    if (input.startPeriod === "AM" && input.endPeriod === "PM") {
      return 1;
    }
    return 0.5;
  }

  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  const calendarDays = Math.round((endUtc - startUtc) / 86_400_000) + 1;

  let total = calendarDays;
  if (input.startPeriod === "PM") {
    total -= 0.5;
  }
  if (input.endPeriod === "AM") {
    total -= 0.5;
  }

  return Math.max(total, 0.5);
};

export const absenceDateRangeToUtcBounds = (
  startDate: string,
  endDate: string,
  utcOffsetHours: number,
): { startAt: Date; endAt: Date } => {
  const start = parseAbsenceDateInput(startDate);
  const end = parseAbsenceDateInput(endDate);
  if (!start || !end) {
    throw new Error("Fechas inválidas");
  }

  const startAt = new Date(Date.UTC(start.year, start.month - 1, start.day, utcOffsetHours, 0, 0, 0));
  const endAt = new Date(
    Date.UTC(end.year, end.month - 1, end.day + 1, utcOffsetHours - 1, 59, 59, 999),
  );

  return { startAt, endAt };
};

/** Returns how many hours local time in `timezone` is ahead of UTC (e.g. Argentina UTC-3 → -3). */
export const getUtcOffsetHoursFromTimezone = (
  timezone: string,
  referenceDate = new Date(),
): number => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceDate);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return Math.round(((asUtc - referenceDate.getTime()) / 3_600_000) * 60) / 60;
};
