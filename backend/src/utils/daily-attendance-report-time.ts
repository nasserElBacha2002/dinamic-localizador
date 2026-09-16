import { DateTime } from "luxon";
import { DAILY_ATTENDANCE_REPORT_DEFAULT_TIME } from "../constants/daily-attendance-report";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidReportTimeHHmm = (value: string): boolean => HHMM_RE.test(value.trim());

/**
 * Civil "yesterday" in company timezone at reference UTC instant.
 * Never subtract 24h from UTC.
 */
export const resolveReportDateLocal = (
  nowUtc: Date,
  timezoneId: string,
): { reportDate: string; localNow: DateTime } => {
  const localNow = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezoneId);
  if (!localNow.isValid) {
    throw new Error(`INVALID_REPORT_TIMEZONE:${timezoneId}`);
  }
  const reportDate = localNow.minus({ days: 1 }).toFormat("yyyy-MM-dd");
  return { reportDate, localNow };
};

/** True when local clock time is at/after configured HH:mm on the local calendar day. */
export const hasLocalReportTimeArrived = (
  nowUtc: Date,
  timezoneId: string,
  reportTimeHHmm: string,
): boolean => {
  const localNow = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezoneId);
  if (!localNow.isValid) {
    throw new Error(`INVALID_REPORT_TIMEZONE:${timezoneId}`);
  }
  const match = HHMM_RE.exec(reportTimeHHmm.trim());
  if (!match) {
    throw new Error(`INVALID_REPORT_TIME:${reportTimeHHmm}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const scheduled = localNow.startOf("day").set({ hour, minute, second: 0, millisecond: 0 });
  return localNow.toMillis() >= scheduled.toMillis();
};

/**
 * Cutoff for classifying incomplete vs missing: start of local "today" in company TZ
 * (i.e. midnight after the reported day). Jornadas ending after this instant are incomplete
 * rather than missing checkout when the window has not closed.
 */
export const resolveReportCutoffUtc = (reportDate: string, timezoneId: string): Date => {
  const startOfReportDay = DateTime.fromISO(reportDate, { zone: timezoneId }).startOf("day");
  if (!startOfReportDay.isValid) {
    throw new Error(`INVALID_REPORT_DATE:${reportDate}:${timezoneId}`);
  }
  return startOfReportDay.plus({ days: 1 }).toUTC().toJSDate();
};

export const normalizeReportTimeHHmm = (value: string | null | undefined): string => {
  if (!value || !String(value).trim()) {
    return DAILY_ATTENDANCE_REPORT_DEFAULT_TIME;
  }
  const raw = String(value).trim();
  if (HHMM_RE.test(raw)) {
    return raw;
  }
  // SQL TIME often serializes as HH:mm:ss
  const withSeconds = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(raw);
  if (withSeconds) {
    return `${withSeconds[1]}:${withSeconds[2]}`;
  }
  return DAILY_ATTENDANCE_REPORT_DEFAULT_TIME;
};

export const listCatchUpReportDates = (
  nowUtc: Date,
  timezoneId: string,
  maxDays: number,
): string[] => {
  const localNow = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(timezoneId);
  if (!localNow.isValid) {
    throw new Error(`INVALID_REPORT_TIMEZONE:${timezoneId}`);
  }
  const dates: string[] = [];
  for (let i = 1; i <= maxDays; i += 1) {
    dates.push(localNow.minus({ days: i }).toFormat("yyyy-MM-dd"));
  }
  return dates;
};
