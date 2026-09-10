/**
 * Calendar-month UTC bounds using Luxon (DST-safe for IANA zones).
 */
import { DateTime } from "luxon";

export interface MonthUtcBounds {
  year: number;
  month: number;
  timezone: string;
  monthStartUtc: Date;
  nextMonthStartUtc: Date;
}

export const getMonthUtcBounds = (
  year: number,
  month: number,
  timezone: string,
): MonthUtcBounds => {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("YEAR_OUT_OF_RANGE");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("MONTH_OUT_OF_RANGE");
  }

  const startLocal = DateTime.fromObject(
    { year, month, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
    { zone: timezone },
  );
  if (!startLocal.isValid) {
    throw new Error(`INVALID_TIMEZONE_OR_DATE:${startLocal.invalidReason ?? "unknown"}`);
  }

  const nextLocal = startLocal.plus({ months: 1 });
  return {
    year,
    month,
    timezone,
    monthStartUtc: startLocal.toUTC().toJSDate(),
    nextMonthStartUtc: nextLocal.toUTC().toJSDate(),
  };
};
