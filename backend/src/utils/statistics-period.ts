import { STATISTICS_MIN_SAMPLE_WORKDAYS } from "../constants/statistics";
import type { StatisticsFilters } from "../schemas/statistics.schema";
import { getDateIsoInTimezone } from "./absence-date";

export interface StatisticsTimeContext {
  referenceAtUtc: Date;
  companyTimeZone: string;
  companyLocalDate: string;
  minSampleWorkdays: number;
}

export const buildStatisticsTimeContext = (
  companyTimeZone: string,
  referenceAtUtc: Date = new Date(),
): StatisticsTimeContext => ({
  referenceAtUtc,
  companyTimeZone,
  companyLocalDate: getDateIsoInTimezone(referenceAtUtc, companyTimeZone),
  minSampleWorkdays: STATISTICS_MIN_SAMPLE_WORKDAYS,
});

export interface PreviousPeriodRange {
  dateFrom: string;
  dateTo: string;
}

/**
 * Immediately preceding window of equal calendar-day span in the company timezone.
 * Falls back to equal UTC duration when bounds are not parseable as calendar days.
 */
export const buildPreviousPeriodRange = (
  dateFrom: string | undefined,
  dateTo: string | undefined,
  companyTimeZone: string,
): PreviousPeriodRange | null => {
  if (!dateFrom || !dateTo) {
    return null;
  }

  const fromMs = Date.parse(dateFrom);
  const toMs = Date.parse(dateTo);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs < fromMs) {
    return null;
  }

  const fromLocal = getDateIsoInTimezone(new Date(fromMs), companyTimeZone);
  const toLocal = getDateIsoInTimezone(new Date(toMs), companyTimeZone);
  const fromParts = fromLocal.split("-").map(Number);
  const toParts = toLocal.split("-").map(Number);
  if (fromParts.length === 3 && toParts.length === 3) {
    const fromUtcNoon = Date.UTC(fromParts[0]!, fromParts[1]! - 1, fromParts[2]!, 12, 0, 0);
    const toUtcNoon = Date.UTC(toParts[0]!, toParts[1]! - 1, toParts[2]!, 12, 0, 0);
    const daySpan = Math.round((toUtcNoon - fromUtcNoon) / 86_400_000) + 1;
    if (daySpan > 0) {
      const prevToDate = new Date(fromUtcNoon);
      prevToDate.setUTCDate(prevToDate.getUTCDate() - 1);
      const prevFromDate = new Date(prevToDate);
      prevFromDate.setUTCDate(prevFromDate.getUTCDate() - (daySpan - 1));

      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (d: Date) =>
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

      // Preserve original time-of-day offsets relative to the ISO bounds when possible.
      const fromTime = dateFrom.includes("T") ? dateFrom.slice(10) : "T00:00:00.000Z";
      const toTime = dateTo.includes("T") ? dateTo.slice(10) : "T23:59:59.999Z";
      return {
        dateFrom: `${fmt(prevFromDate)}${fromTime.startsWith("T") ? fromTime : `T${fromTime}`}`,
        dateTo: `${fmt(prevToDate)}${toTime.startsWith("T") ? toTime : `T${toTime}`}`,
      };
    }
  }

  const durationMs = toMs - fromMs;
  const prevToMs = fromMs - 1;
  const prevFromMs = prevToMs - durationMs;
  return {
    dateFrom: new Date(prevFromMs).toISOString(),
    dateTo: new Date(prevToMs).toISOString(),
  };
};

export const withPreviousPeriodFilters = (
  filters: StatisticsFilters,
  companyTimeZone: string,
): StatisticsFilters | null => {
  const previous = buildPreviousPeriodRange(filters.dateFrom, filters.dateTo, companyTimeZone);
  if (!previous) {
    return null;
  }

  const { export: _exportFlag, rankingMode: _rankingMode, ...rest } = filters;
  return {
    ...rest,
    dateFrom: previous.dateFrom,
    dateTo: previous.dateTo,
    export: false,
    rankingMode: undefined,
    incompleteCoverage: false,
    openAttendance: false,
  };
};
