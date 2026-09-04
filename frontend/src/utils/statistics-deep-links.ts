/**
 * Deep-links from Estadísticas exception KPIs/charts to operational list views.
 */

export type StatisticsExceptionLinkKey =
  | "open_attendance"
  | "unjustified_absence"
  | "outside_geofence"
  | "pending_review"
  | "late_arrival"
  | "early_departure"
  | "incomplete_coverage";

export interface StatisticsDeepLinkContext {
  dateFrom?: string;
  dateTo?: string;
  operationIds?: string[];
  serviceIds?: string[];
  employeeIds?: string[];
}

const appendDateRange = (params: URLSearchParams, ctx: StatisticsDeepLinkContext) => {
  if (ctx.dateFrom) {
    params.set("dateFrom", ctx.dateFrom.slice(0, 10));
    params.set("datePreset", "custom");
  }
  if (ctx.dateTo) {
    params.set("dateTo", ctx.dateTo.slice(0, 10));
    params.set("datePreset", "custom");
  }
};

const appendSharedFilters = (params: URLSearchParams, ctx: StatisticsDeepLinkContext) => {
  appendDateRange(params, ctx);
  if (ctx.operationIds?.length) {
    params.set("operationIds", ctx.operationIds.join(","));
  }
  if (ctx.serviceIds?.length) {
    params.set("serviceIds", ctx.serviceIds.join(","));
  }
  if (ctx.employeeIds?.length) {
    params.set("employeeIds", ctx.employeeIds.join(","));
  }
};

export function buildAttendanceExceptionHref(
  key: StatisticsExceptionLinkKey,
  ctx: StatisticsDeepLinkContext,
): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, ctx);

  switch (key) {
    case "outside_geofence":
      params.set("locationStatus", "OUTSIDE_GEOFENCE");
      break;
    case "pending_review":
      params.set("validationStatus", "PENDING_REVIEW");
      break;
    case "late_arrival":
      params.set("punctualityStatus", "LATE");
      break;
    case "early_departure":
      params.set("checkoutStatus", "CHECKOUT_EARLY_REVIEW");
      break;
    case "open_attendance":
      params.set("openAttendance", "true");
      break;
    case "unjustified_absence":
      return buildStatisticsAbsenceHref(ctx);
    case "incomplete_coverage":
      return buildIncompleteCoverageHref(ctx);
    default:
      break;
  }

  const query = params.toString();
  return query ? `/attendance?${query}` : "/attendance";
}

export function buildStatisticsAbsenceHref(ctx: StatisticsDeepLinkContext): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, ctx);
  params.set("tab", "employee");
  params.set("effectiveState", "ABSENT");
  return `/statistics?${params.toString()}`;
}

export function buildIncompleteCoverageHref(ctx: StatisticsDeepLinkContext): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, ctx);
  params.set("tab", "operation");
  params.set("incompleteCoverage", "true");
  params.set("opSortBy", "coverageRate");
  params.set("opSortOrder", "asc");
  return `/statistics?${params.toString()}`;
}

export function buildEmployeeAttendanceHref(
  employeeId: string,
  ctx: StatisticsDeepLinkContext,
): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, { ...ctx, employeeIds: [employeeId] });
  return `/attendance?${params.toString()}`;
}

export function buildOperationDetailHref(operationId: string): string {
  return `/operations/${operationId}`;
}

export function buildOperationAttendanceHref(
  operationId: string,
  ctx: StatisticsDeepLinkContext = {},
): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, { ...ctx, operationIds: [operationId] });
  return `/attendance?${params.toString()}`;
}

export function buildServiceAttendanceHref(
  serviceId: string,
  ctx: StatisticsDeepLinkContext,
): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, { ...ctx, serviceIds: [serviceId] });
  return `/attendance?${params.toString()}`;
}
