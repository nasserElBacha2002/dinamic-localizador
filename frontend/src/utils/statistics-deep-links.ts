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
  | "incomplete_coverage"
  | "coverage_required"
  | "operation_modified"
  | "not_confirmed"
  | "missing_check_in"
  | "missing_check_out"
  | "no_punch";

export type StatisticsIncidentLinkKey =
  | "any_incident"
  | "coverage_required"
  | "operation_modified"
  | "not_confirmed"
  | "incomplete_punches"
  | "missing_check_in"
  | "missing_check_out"
  | "no_punch";

export interface StatisticsDeepLinkContext {
  dateFrom?: string;
  dateTo?: string;
  operationIds?: string[];
  serviceIds?: string[];
  employeeIds?: string[];
  workTeamIds?: string[];
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
  if (ctx.workTeamIds?.length) {
    params.set("workTeamIds", ctx.workTeamIds.join(","));
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
    case "coverage_required":
      return buildOperationalIncidentHref("coverage_required", ctx);
    case "operation_modified":
      return buildOperationalIncidentHref("operation_modified", ctx);
    case "not_confirmed":
      return buildOperationalIncidentHref("not_confirmed", ctx);
    case "missing_check_in":
      return buildOperationalIncidentHref("missing_check_in", ctx);
    case "missing_check_out":
      return buildOperationalIncidentHref("missing_check_out", ctx);
    case "no_punch":
      return buildOperationalIncidentHref("no_punch", ctx);
    default:
      break;
  }

  const query = params.toString();
  return query ? `/attendance?${query}` : "/attendance";
}

export function buildOperationalIncidentHref(
  key: StatisticsIncidentLinkKey,
  ctx: StatisticsDeepLinkContext,
): string {
  const params = new URLSearchParams();
  appendSharedFilters(params, ctx);
  params.set("tab", "incidents");

  switch (key) {
    case "coverage_required":
      params.set("incidentType", "COVERAGE_REQUIRED");
      break;
    case "operation_modified":
      params.set("incidentType", "OPERATION_MODIFIED");
      break;
    case "not_confirmed":
      params.set("incidentType", "NOT_CONFIRMED");
      break;
    case "incomplete_punches":
      break;
    case "missing_check_in":
      params.set("incidentType", "MISSING_CHECK_IN");
      break;
    case "missing_check_out":
      params.set("incidentType", "MISSING_CHECK_OUT");
      break;
    case "no_punch":
      params.set("incidentType", "NO_PUNCH");
      break;
    case "any_incident":
    default:
      break;
  }

  return `/statistics?${params.toString()}`;
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
