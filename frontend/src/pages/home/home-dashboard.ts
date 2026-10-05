import type { DateRangeValue } from "../../types/date-range";
import type { OperationFilters } from "../../types/operation";
import type { AttendanceStatisticsSummary, StatisticsFilters } from "../../types/statistics";
import {
  getDefaultOperationDateRange,
  getDateRangeQueryValue,
} from "../../utils/date-range";
import { dateRangeToUrlFields } from "../../utils/date-range-url";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../../utils/dates";
import type { StatisticsDeepLinkContext } from "../../utils/statistics-deep-links";

export type HomeTodayIsoRange = {
  dateRange: DateRangeValue;
  isoDateFrom: string;
  isoDateTo: string;
};

export function resolveHomeTodayIsoRange(referenceDate?: string): HomeTodayIsoRange | null {
  const dateRange = getDefaultOperationDateRange(referenceDate);
  const dateQuery = getDateRangeQueryValue(dateRange);
  if (!dateQuery.from || !dateQuery.to) {
    return null;
  }

  return {
    dateRange,
    isoDateFrom: dateInputToIsoStart(dateQuery.from),
    isoDateTo: dateInputToIsoEnd(dateQuery.to),
  };
}

export function buildHomeStatisticsFilters(
  isoDateFrom: string,
  isoDateTo: string,
): StatisticsFilters {
  return {
    dateFrom: isoDateFrom,
    dateTo: isoDateTo,
  };
}

export function buildHomeStatisticsLinkContext(
  isoDateFrom: string,
  isoDateTo: string,
): StatisticsDeepLinkContext {
  return {
    dateFrom: isoDateFrom,
    dateTo: isoDateTo,
  };
}

export function buildHomeTodayOperationsFilters(
  isoDateFrom: string,
  isoDateTo: string,
): OperationFilters {
  return {
    page: 1,
    limit: 6,
    sortBy: "scheduledStart",
    sortDirection: "asc",
    dateFrom: isoDateFrom,
    dateTo: isoDateTo,
  };
}

export function buildDateRangeListHref(basePath: string, dateRange: DateRangeValue): string {
  const fields = dateRangeToUrlFields(dateRange);
  const params = new URLSearchParams();
  if (fields.datePreset) {
    params.set("datePreset", fields.datePreset);
  }
  if (fields.dateFrom) {
    params.set("dateFrom", fields.dateFrom);
  }
  if (fields.dateTo) {
    params.set("dateTo", fields.dateTo);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildHomeStatisticsPageHref(dateRange: DateRangeValue): string {
  const href = buildDateRangeListHref("/statistics", dateRange);
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}tab=general`;
}

export function buildHomeStatisticsEmployeeTabHref(
  effectiveState: "ABSENT" | "JUSTIFIED",
  ctx: StatisticsDeepLinkContext,
): string {
  const params = new URLSearchParams();
  if (ctx.dateFrom) {
    params.set("dateFrom", ctx.dateFrom.slice(0, 10));
    params.set("datePreset", "custom");
  }
  if (ctx.dateTo) {
    params.set("dateTo", ctx.dateTo.slice(0, 10));
    params.set("datePreset", "custom");
  }
  params.set("tab", "employee");
  params.set("effectiveState", effectiveState);
  return `/statistics?${params.toString()}`;
}

export function buildHomeStatisticsConfirmationHref(
  confirmationStatus: "UNAVAILABLE",
  ctx: StatisticsDeepLinkContext,
): string {
  const params = new URLSearchParams();
  if (ctx.dateFrom) {
    params.set("dateFrom", ctx.dateFrom.slice(0, 10));
    params.set("datePreset", "custom");
  }
  if (ctx.dateTo) {
    params.set("dateTo", ctx.dateTo.slice(0, 10));
    params.set("datePreset", "custom");
  }
  params.set("tab", "employee");
  params.set("confirmationStatus", confirmationStatus);
  return `/statistics?${params.toString()}`;
}

export function countHomeAttendanceIrregularities(summary?: AttendanceStatisticsSummary): number {
  if (!summary) {
    return 0;
  }

  return summary.pendingReviewCount + summary.outsideGeofenceCount + summary.rejectedCount;
}
