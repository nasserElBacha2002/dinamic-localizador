import type {
  AttendanceByEmployeeRow,
  AttendanceByOperationRow,
  AttendanceStatisticsSummary,
  OperationalIncidentDetailRow,
  OperationalIncidentType,
} from "../../types/statistics";
import type { StatusBadgeTone } from "../../design-system";
import {
  buildAttendanceExceptionHref,
  buildEmployeeAttendanceHref,
  buildOperationalIncidentHref,
  buildOperationDetailHref,
  type StatisticsDeepLinkContext,
  type StatisticsExceptionLinkKey,
  type StatisticsIncidentLinkKey,
} from "../../utils/statistics-deep-links";
import { formatPercent } from "../../utils/export";
import { buildHomeStatisticsConfirmationHref } from "./home-dashboard";

export const HOME_ATTENTION_INCIDENT_LIMIT = 80;
export const HOME_ATTENTION_EMPLOYEE_LIMIT = 5;
export const HOME_ATTENTION_MAX_OPERATION_GROUPS = 5;
export const HOME_ATTENTION_MAX_GLOBAL_ISSUES = 6;
export const HOME_ATTENTION_MAX_ISSUES_PER_GROUP = 3;

export type HomeAttentionSeverity = "critical" | "high" | "medium" | "low";

const SEVERITY_WEIGHT: Record<HomeAttentionSeverity, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

export const severityTone: Record<HomeAttentionSeverity, StatusBadgeTone> = {
  critical: "danger",
  high: "warning",
  medium: "warning",
  low: "info",
};

export const severityLabel: Record<HomeAttentionSeverity, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};

export function operationalIncidentTypeSeverity(
  incidentType: OperationalIncidentType,
): HomeAttentionSeverity {
  switch (incidentType) {
    case "NOT_CONFIRMED_AND_ABSENT":
      return "critical";
    case "COVERAGE_REQUIRED":
    case "NO_PUNCH":
    case "MISSING_CHECK_IN":
    case "MISSING_CHECK_OUT":
      return "high";
    case "NOT_CONFIRMED":
      return "medium";
    case "OPERATION_MODIFIED":
    default:
      return "low";
  }
}

export function operationalIncidentTypeWeight(incidentType: OperationalIncidentType): number {
  return SEVERITY_WEIGHT[operationalIncidentTypeSeverity(incidentType)];
}

export function incidentTypeToStatisticsKey(
  incidentType: OperationalIncidentType,
): StatisticsIncidentLinkKey {
  switch (incidentType) {
    case "COVERAGE_REQUIRED":
      return "coverage_required";
    case "OPERATION_MODIFIED":
      return "operation_modified";
    case "NOT_CONFIRMED":
    case "NOT_CONFIRMED_AND_ABSENT":
      return "not_confirmed";
    case "MISSING_CHECK_IN":
      return "missing_check_in";
    case "MISSING_CHECK_OUT":
      return "missing_check_out";
    case "NO_PUNCH":
      return "no_punch";
    default:
      return "any_incident";
  }
}

export type HomeAttentionIssue = {
  id: string;
  severity: HomeAttentionSeverity;
  sortWeight: number;
  title: string;
  detail?: string;
  href: string;
};

export type HomeAttentionOperationGroup = {
  operationId: string;
  serviceName: string;
  serviceAddress: string | null;
  maxSeverity: HomeAttentionSeverity;
  sortWeight: number;
  issues: HomeAttentionIssue[];
  operationHref: string;
};

export type HomeAttentionEmployeeRow = {
  employeeId: string;
  employeeName: string;
  primaryIncidentLabel: string | null;
  incidentCount: number;
  severity: HomeAttentionSeverity;
  href: string;
};

export type HomeAttentionViewModel = {
  globalIssues: HomeAttentionIssue[];
  operationGroups: HomeAttentionOperationGroup[];
  employees: HomeAttentionEmployeeRow[];
  isEmpty: boolean;
  truncatedGlobalIssues: boolean;
  truncatedIncidentDetails: boolean;
  truncatedEmployees: boolean;
};

export type BuildHomeAttentionInput = {
  summary?: AttendanceStatisticsSummary;
  unavailableWorkdays?: number;
  lowCoverageOperations: AttendanceByOperationRow[];
  incidentDetails: OperationalIncidentDetailRow[];
  incidentDetailsTotal?: number;
  attentionEmployees: AttendanceByEmployeeRow[];
  attentionEmployeesTotal?: number;
  linkContext: StatisticsDeepLinkContext;
};

function maxSeverity(a: HomeAttentionSeverity, b: HomeAttentionSeverity): HomeAttentionSeverity {
  return SEVERITY_WEIGHT[a] >= SEVERITY_WEIGHT[b] ? a : b;
}

function buildGlobalIssue(
  id: string,
  severity: HomeAttentionSeverity,
  title: string,
  count: number,
  href: string,
  detail?: string,
): HomeAttentionIssue | null {
  if (count <= 0) {
    return null;
  }
  return {
    id,
    severity,
    sortWeight: SEVERITY_WEIGHT[severity],
    title,
    detail: detail ?? `${count} en el día`,
    href,
  };
}

function buildRejectedAttendanceHref(ctx: StatisticsDeepLinkContext): string {
  const params = new URLSearchParams();
  if (ctx.dateFrom) {
    params.set("dateFrom", ctx.dateFrom.slice(0, 10));
    params.set("datePreset", "custom");
  }
  if (ctx.dateTo) {
    params.set("dateTo", ctx.dateTo.slice(0, 10));
    params.set("datePreset", "custom");
  }
  params.set("validationStatus", "REJECTED");
  const query = params.toString();
  return query ? `/attendance?${query}` : "/attendance";
}

function buildGlobalIssuesFromSummary(
  summary?: AttendanceStatisticsSummary,
  unavailableWorkdays?: number,
  linkContext: StatisticsDeepLinkContext = {},
): HomeAttentionIssue[] {
  const exception = (key: StatisticsExceptionLinkKey) =>
    buildAttendanceExceptionHref(key, linkContext);

  const items = [
    buildGlobalIssue(
      "pending_review",
      "critical",
      "Asistencias pendientes de revisión",
      summary?.pendingReviewCount ?? 0,
      exception("pending_review"),
    ),
    buildGlobalIssue(
      "rejected",
      "critical",
      "Asistencias rechazadas",
      summary?.rejectedCount ?? 0,
      buildRejectedAttendanceHref(linkContext),
    ),
    buildGlobalIssue(
      "outside_geofence",
      "high",
      "Marcaciones fuera de geocerca",
      summary?.outsideGeofenceCount ?? 0,
      exception("outside_geofence"),
    ),
    buildGlobalIssue(
      "unjustified_absence",
      "high",
      "Ausencias no justificadas",
      summary?.absentWorkdays ?? 0,
      exception("unjustified_absence"),
    ),
    buildGlobalIssue(
      "open_attendance",
      "high",
      "Jornadas sin cierre",
      summary?.openAttendanceWorkdays ?? 0,
      exception("open_attendance"),
    ),
    buildGlobalIssue(
      "unavailable",
      "medium",
      "Colaboradores que avisaron que no asistirían",
      unavailableWorkdays ?? 0,
      buildHomeStatisticsConfirmationHref("UNAVAILABLE", linkContext),
    ),
    buildGlobalIssue(
      "late_arrival",
      "medium",
      "Llegadas tarde",
      summary?.lateWorkdays ?? 0,
      exception("late_arrival"),
    ),
  ].filter((item): item is HomeAttentionIssue => item != null);

  return items.sort((a, b) => b.sortWeight - a.sortWeight);
}

export function employeeAttentionSeverity(row: AttendanceByEmployeeRow): HomeAttentionSeverity {
  if ((row.pendingReviewCount ?? 0) > 0) {
    return "critical";
  }
  if ((row.absentWorkdays ?? 0) > 0 || (row.openAttendanceWorkdays ?? 0) > 0) {
    return "high";
  }
  if (
    (row.outsideGeofenceCount ?? 0) > 0 ||
    (row.earlyDepartureWorkdays ?? 0) > 0 ||
    (row.lateWorkdays ?? 0) > 0
  ) {
    return "medium";
  }
  if ((row.incidentCount ?? 0) >= 3) {
    return "high";
  }
  if ((row.incidentCount ?? 0) >= 1) {
    return "medium";
  }
  return "low";
}

function mergeOperationGroup(
  groups: Map<string, HomeAttentionOperationGroup>,
  operationId: string,
  seed: Pick<HomeAttentionOperationGroup, "serviceName" | "serviceAddress">,
  issue: HomeAttentionIssue,
) {
  const existing = groups.get(operationId);
  if (!existing) {
    groups.set(operationId, {
      operationId,
      serviceName: seed.serviceName,
      serviceAddress: seed.serviceAddress,
      maxSeverity: issue.severity,
      sortWeight: issue.sortWeight,
      issues: [issue],
      operationHref: buildOperationDetailHref(operationId),
    });
    return;
  }

  const duplicate = existing.issues.some((entry) => entry.id === issue.id);
  if (duplicate) {
    return;
  }

  existing.issues.push(issue);
  existing.maxSeverity = maxSeverity(existing.maxSeverity, issue.severity);
  existing.sortWeight = Math.max(existing.sortWeight, issue.sortWeight);
  existing.issues.sort((a, b) => b.sortWeight - a.sortWeight);
}

export function buildHomeAttentionViewModel(
  input: BuildHomeAttentionInput,
): HomeAttentionViewModel {
  const { linkContext } = input;
  const allGlobalIssues = buildGlobalIssuesFromSummary(
    input.summary,
    input.unavailableWorkdays,
    linkContext,
  );
  const globalIssues = allGlobalIssues.slice(0, HOME_ATTENTION_MAX_GLOBAL_ISSUES);
  const truncatedGlobalIssues = allGlobalIssues.length > globalIssues.length;

  const groups = new Map<string, HomeAttentionOperationGroup>();

  for (const row of input.lowCoverageOperations) {
    const rate = row.coverageRate ?? row.attendanceRate;
    const issue: HomeAttentionIssue = {
      id: `low-coverage:${row.operationId}`,
      severity: "high",
      sortWeight: SEVERITY_WEIGHT.high,
      title: "Cobertura de plantilla incompleta",
      detail:
        rate == null
          ? "Consolidado por debajo del esperado"
          : `Cobertura ${formatPercent(rate)}`,
      href: buildAttendanceExceptionHref("incomplete_coverage", {
        ...linkContext,
        operationIds: [row.operationId],
      }),
    };
    mergeOperationGroup(groups, row.operationId, {
      serviceName: row.serviceName,
      serviceAddress: row.serviceAddress,
    }, issue);
  }

  for (const row of input.incidentDetails) {
    const severity = operationalIncidentTypeSeverity(row.incidentType);
    const weight = SEVERITY_WEIGHT[severity];
    const incidentKey = incidentTypeToStatisticsKey(row.incidentType);
    const employeePart = row.employeeName ? ` · ${row.employeeName}` : "";
    const issue: HomeAttentionIssue = {
      id: `incident:${row.detailId}`,
      severity,
      sortWeight: weight,
      title: row.incidentLabel,
      detail: employeePart.replace(/^ · /, "") || row.serviceName,
      href: buildOperationalIncidentHref(incidentKey, {
        ...linkContext,
        operationIds: [row.operationId],
        ...(row.employeeId ? { employeeIds: [row.employeeId] } : {}),
      }),
    };
    mergeOperationGroup(groups, row.operationId, {
      serviceName: row.serviceName,
      serviceAddress: row.serviceAddress,
    }, issue);
  }

  const sortedGroups = [...groups.values()].sort(
    (a, b) => b.sortWeight - a.sortWeight || a.serviceName.localeCompare(b.serviceName),
  );
  const operationGroups = sortedGroups.slice(0, HOME_ATTENTION_MAX_OPERATION_GROUPS).map(
    (group) => ({
      ...group,
      issues: group.issues.slice(0, HOME_ATTENTION_MAX_ISSUES_PER_GROUP),
    }),
  );

  const employees = input.attentionEmployees
    .map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      primaryIncidentLabel: row.primaryIncidentLabel,
      incidentCount: row.incidentCount ?? 0,
      severity: employeeAttentionSeverity(row),
      href: buildEmployeeAttendanceHref(row.employeeId, linkContext),
    }))
    .sort((a, b) => {
      const weightDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
      if (weightDiff !== 0) {
        return weightDiff;
      }
      return (b.incidentCount ?? 0) - (a.incidentCount ?? 0);
    })
    .slice(0, HOME_ATTENTION_EMPLOYEE_LIMIT);

  const truncatedIncidentDetails =
    truncatedGlobalIssues ||
    (input.incidentDetailsTotal ?? input.incidentDetails.length) > input.incidentDetails.length ||
    sortedGroups.length > HOME_ATTENTION_MAX_OPERATION_GROUPS ||
    sortedGroups.some((group) => group.issues.length > HOME_ATTENTION_MAX_ISSUES_PER_GROUP);
  const truncatedEmployees =
    (input.attentionEmployeesTotal ?? input.attentionEmployees.length) > employees.length;

  const isEmpty =
    allGlobalIssues.length === 0 && sortedGroups.length === 0 && employees.length === 0;

  return {
    globalIssues,
    operationGroups,
    employees,
    isEmpty,
    truncatedGlobalIssues,
    truncatedIncidentDetails,
    truncatedEmployees,
  };
}
