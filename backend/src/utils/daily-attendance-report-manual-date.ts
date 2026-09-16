import { DateTime } from "luxon";
import { DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS } from "../constants/daily-attendance-report";
import { listCatchUpReportDates, resolveReportDateLocal } from "./daily-attendance-report-time";

export type ManualReportDateValidation =
  | { ok: true; reportDate: string }
  | { ok: false; code: "INVALID_DATE" | "FUTURE_DATE" | "OUTSIDE_CATCHUP"; message: string };

/**
 * Validates a civil YYYY-MM-DD for manual trigger using Luxon in company TZ.
 * Allows D-1 and catch-up window only (no future, no invalid calendar dates).
 */
export const validateManualReportDate = (input: {
  reportDateRaw: string;
  timezoneId: string;
  nowUtc?: Date;
}): ManualReportDateValidation => {
  const parsed = DateTime.fromISO(input.reportDateRaw, { zone: input.timezoneId });
  if (!parsed.isValid || parsed.toFormat("yyyy-MM-dd") !== input.reportDateRaw.trim()) {
    return {
      ok: false,
      code: "INVALID_DATE",
      message: "La fecha reportada no es una fecha civil válida (YYYY-MM-DD).",
    };
  }

  const nowUtc = input.nowUtc ?? new Date();
  const { reportDate: yesterday } = resolveReportDateLocal(nowUtc, input.timezoneId);
  const allowed = new Set(
    listCatchUpReportDates(nowUtc, input.timezoneId, DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS),
  );
  allowed.add(yesterday);

  const localToday = DateTime.fromJSDate(nowUtc, { zone: "utc" }).setZone(input.timezoneId);
  if (parsed.startOf("day") > localToday.startOf("day")) {
    return {
      ok: false,
      code: "FUTURE_DATE",
      message: "No se puede generar un reporte para una fecha futura.",
    };
  }

  if (!allowed.has(input.reportDateRaw.trim())) {
    return {
      ok: false,
      code: "OUTSIDE_CATCHUP",
      message: `La fecha está fuera del rango de catch-up permitido (${DAILY_ATTENDANCE_REPORT_CATCHUP_MAX_DAYS} días).`,
    };
  }

  return { ok: true, reportDate: input.reportDateRaw.trim() };
};
