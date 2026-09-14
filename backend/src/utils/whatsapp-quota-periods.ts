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
 *
 * Period identity for counters is the open UTC interval once created.
 * Callers must prefer an existing open period whose [start, end) contains `now`
 * before opening a new window from the current timezone — so changing company
 * timezone mid-day/week does not reset counters.
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

/** Prefer an open stored period if its UTC interval contains now; else compute from TZ. */
export const preferOpenOrResolvePeriod = (input: {
  kind: QuotaPeriodKind;
  nowUtc: Date;
  timezoneId: string;
  open: {
    periodKey: string;
    periodStartUtc: Date;
    periodEndUtc: Date;
    timezoneId: string;
  } | null;
}): QuotaPeriodWindow => {
  if (
    input.open &&
    input.open.periodStartUtc.getTime() <= input.nowUtc.getTime() &&
    input.nowUtc.getTime() < input.open.periodEndUtc.getTime()
  ) {
    return {
      kind: input.kind,
      periodKey: input.open.periodKey,
      periodStartUtc: input.open.periodStartUtc,
      periodEndUtc: input.open.periodEndUtc,
      timezoneId: input.open.timezoneId,
    };
  }
  return input.kind === "DAY"
    ? resolveDayPeriod(input.nowUtc, input.timezoneId)
    : resolveWeekPeriod(input.nowUtc, input.timezoneId);
};
