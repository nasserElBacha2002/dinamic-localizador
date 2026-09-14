import { DateTime } from "luxon";

export type QuotaPeriodKind = "DAY" | "WEEK";

export type QuotaPeriodWindow = {
  kind: QuotaPeriodKind;
  /** Stable identity for the local period (e.g. 2026-09-14 or 2026-W38). */
  periodKey: string;
  periodStartUtc: Date;
  periodEndUtc: Date;
  timezoneId: string;
};

/**
 * Day/week windows in company timezone; stored bounds in UTC.
 * Week starts Monday 00:00 local (ISO).
 * Changing timezone mid-period still uses the period_key opened for that employee/company
 * — counters are keyed by (period_kind, period_key), not recomputed from a new TZ.
 */
export const resolveDayPeriod = (nowUtc: Date, timezoneId: string): QuotaPeriodWindow => {
  const local = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezoneId);
  if (!local.isValid) {
    throw new Error(`INVALID_QUOTA_TIMEZONE:${timezoneId}`);
  }
  const startLocal = local.startOf("day");
  const endLocal = startLocal.plus({ days: 1 });
  return {
    kind: "DAY",
    periodKey: startLocal.toFormat("yyyy-MM-dd"),
    periodStartUtc: startLocal.toUTC().toJSDate(),
    periodEndUtc: endLocal.toUTC().toJSDate(),
    timezoneId,
  };
};

export const resolveWeekPeriod = (nowUtc: Date, timezoneId: string): QuotaPeriodWindow => {
  const local = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezoneId);
  if (!local.isValid) {
    throw new Error(`INVALID_QUOTA_TIMEZONE:${timezoneId}`);
  }
  const startLocal = local.startOf("week"); // Monday in Luxon ISO
  const endLocal = startLocal.plus({ weeks: 1 });
  return {
    kind: "WEEK",
    periodKey: `${startLocal.weekYear}-W${String(startLocal.weekNumber).padStart(2, "0")}`,
    periodStartUtc: startLocal.toUTC().toJSDate(),
    periodEndUtc: endLocal.toUTC().toJSDate(),
    timezoneId,
  };
};
