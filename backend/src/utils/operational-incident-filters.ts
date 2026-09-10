/**
 * Filter applicability for operational incident statistics.
 *
 * Matrix (✓ = applied, — = not applicable / ignored for that family):
 *
 * | Filter              | Coverage | Change | Confirmation | Punch | Summary aggregates |
 * |---------------------|----------|--------|--------------|-------|--------------------|
 * | date                | ✓        | ✓      | ✓            | ✓     | ✓                  |
 * | operation           | ✓        | ✓      | ✓            | ✓*    | ✓                  |
 * | service             | ✓        | ✓      | ✓            | ✓*    | ✓                  |
 * | employee            | ✓†       | ✓‡     | ✓            | ✓     | ✓                  |
 * | workTeam            | ✓        | ✓      | ✓            | ✓*    | ✓                  |
 * | operationKind       | ✓        | ✓      | ✓            | ✓*    | ✓                  |
 * | operationStatus     | ✓        | ✓      | ✓            | ✓*    | ✓                  |
 * | confirmationStatus  | —        | —      | ✓ only       | —     | ✓ (confirm family) |
 * | punchCompleteness   | —        | —      | —            | ✓ only| ✓ (punch family)   |
 * | incidentType        | DETAIL/EXPORT only — NOT applied to summary aggregate counts |
 *
 * * Punch rows inherit operation/service/kind/status/team via the workday CTE filters.
 * † Coverage: replaced OR replacement employee.
 * ‡ Change / OPERATION_MODIFIED: employee filter applies only when the change is an
 *   ASSIGNMENT_CHANGE involving that employee; pure operation_modified without assignment
 *   involvement is excluded when employeeIds are set.
 *
 * Known filters accepted by Zod must not be silently ignored when applicable.
 */

import sql from "mssql";
import type { StatisticsFilters } from "../schemas/statistics.schema";
import { applySqlFilters, type SqlFilter } from "./sql-list-query";
import { createUuidInFilter } from "./sql-uuid-in-filter";

const toDateOnly = (value: string): string => value.slice(0, 10);

export type IncidentFilterFamily =
  | "coverage"
  | "change"
  | "confirmation"
  | "punch"
  | "summary";

/** Documents which filters apply to which families (for tests / maintainers). */
export const INCIDENT_FILTER_APPLICABILITY: Record<
  | "date"
  | "operation"
  | "service"
  | "employee"
  | "workTeam"
  | "operationKind"
  | "operationStatus"
  | "confirmationStatus"
  | "punchCompleteness"
  | "incidentType",
  IncidentFilterFamily[]
> = {
  date: ["coverage", "change", "confirmation", "punch", "summary"],
  operation: ["coverage", "change", "confirmation", "punch", "summary"],
  service: ["coverage", "change", "confirmation", "punch", "summary"],
  employee: ["coverage", "change", "confirmation", "punch", "summary"],
  workTeam: ["coverage", "change", "confirmation", "punch", "summary"],
  operationKind: ["coverage", "change", "confirmation", "punch", "summary"],
  operationStatus: ["coverage", "change", "confirmation", "punch", "summary"],
  confirmationStatus: ["confirmation", "summary"],
  punchCompleteness: ["punch", "summary"],
  /** DETAIL / EXPORT only — never summary aggregates. */
  incidentType: [],
};

export const buildOperationScopeFilters = (
  companyId: string,
  filters: StatisticsFilters,
  options?: { includeCompanyBind?: boolean },
): SqlFilter[] => {
  const includeCompany = options?.includeCompanyBind !== false;
  const sqlFilters: SqlFilter[] = [];

  if (includeCompany) {
    sqlFilters.push({
      clause: "o.company_id = @companyId",
      apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
    });
  }

  const operationFilter = createUuidInFilter({
    column: "o.id",
    parameterPrefix: "incOpId",
    values: filters.operationIds ?? [],
  });
  if (operationFilter) {
    sqlFilters.push(operationFilter);
  }

  const serviceFilter = createUuidInFilter({
    column: "o.service_id",
    parameterPrefix: "incSvcId",
    values: filters.serviceIds ?? [],
  });
  if (serviceFilter) {
    sqlFilters.push(serviceFilter);
  }

  if (filters.operationKind) {
    sqlFilters.push({
      clause: "o.operation_kind = @incOperationKind",
      apply: (request) =>
        request.input("incOperationKind", sql.NVarChar, filters.operationKind),
    });
  }

  if (filters.operationStatus) {
    sqlFilters.push({
      clause: "o.status = @incOperationStatus",
      apply: (request) =>
        request.input("incOperationStatus", sql.NVarChar, filters.operationStatus),
    });
  }

  const workTeamIds = filters.workTeamIds ?? [];
  if (workTeamIds.length > 0) {
    const teamFilter = createUuidInFilter({
      column: "wt_scope.work_team_id",
      parameterPrefix: "incTeamId",
      values: workTeamIds,
    });
    if (teamFilter) {
      sqlFilters.push({
        clause: `EXISTS (
          SELECT 1
          FROM (
            SELECT oa.source_work_team_id AS work_team_id
            FROM operation_assignments oa
            WHERE oa.company_id = o.company_id
              AND oa.operation_id = o.id
              AND oa.source_work_team_id IS NOT NULL
            UNION ALL
            SELECT ce.work_team_id
            FROM operation_coverage_events ce
            WHERE ce.company_id = o.company_id
              AND ce.operation_id = o.id
              AND ce.work_team_id IS NOT NULL
          ) wt_scope
          WHERE ${teamFilter.clause}
        )`,
        apply: teamFilter.apply,
      });
    }
  }

  return sqlFilters;
};

export const buildDateRangeClause = (
  column: string,
  filters: Pick<StatisticsFilters, "dateFrom" | "dateTo">,
  paramPrefix = "incidentDate",
): { clause: string; apply: (request: sql.Request) => void } => {
  const hasFrom = Boolean(filters.dateFrom);
  const hasTo = Boolean(filters.dateTo);
  const fromParam = `${paramPrefix}From`;
  const toParam = `${paramPrefix}To`;
  const parts: string[] = ["1 = 1"];
  if (hasFrom) {
    parts.push(`${column} >= @${fromParam}`);
  }
  if (hasTo) {
    parts.push(`${column} <= @${toParam}`);
  }
  return {
    clause: parts.join(" AND "),
    apply: (request) => {
      if (hasFrom) {
        request.input(fromParam, sql.Date, toDateOnly(filters.dateFrom!));
      }
      if (hasTo) {
        request.input(toParam, sql.Date, toDateOnly(filters.dateTo!));
      }
    },
  };
};

export const buildCoverageEmployeeClause = (
  employeeIds: string[],
): { clause: string; apply: (request: sql.Request) => void } | null => {
  if (employeeIds.length === 0) {
    return null;
  }
  const replacement = createUuidInFilter({
    column: "ce.replacement_employee_id",
    parameterPrefix: "covEmp",
    values: employeeIds,
  });
  const replaced = createUuidInFilter({
    column: "ce.replaced_employee_id",
    parameterPrefix: "covEmpRep",
    values: employeeIds,
  });
  if (!replacement || !replaced) {
    return null;
  }
  return {
    clause: `(${replacement.clause} OR ${replaced.clause})`,
    apply: (request) => {
      replacement.apply(request);
      replaced.apply(request);
    },
  };
};

export const buildConfirmationEmployeeClause = (
  employeeIds: string[],
): { clause: string; apply: (request: sql.Request) => void } | null => {
  if (employeeIds.length === 0) {
    return null;
  }
  const filter = createUuidInFilter({
    column: "oa.employee_id",
    parameterPrefix: "confEmp",
    values: employeeIds,
  });
  if (!filter) {
    return null;
  }
  return {
    clause: filter.clause,
    apply: filter.apply,
  };
};

export const buildPunchEmployeeClause = (
  employeeIds: string[],
): { clause: string; apply: (request: sql.Request) => void } | null => {
  if (employeeIds.length === 0) {
    return null;
  }
  const filter = createUuidInFilter({
    column: "employee_id",
    parameterPrefix: "punchEmp",
    values: employeeIds,
  });
  if (!filter) {
    return null;
  }
  return {
    clause: filter.clause,
    apply: filter.apply,
  };
};

/**
 * Employee filter for OPERATION_MODIFIED: only ASSIGNMENT_CHANGE rows that involve
 * the employee (via coverage events linking replaced/replacement). Pure schedule/field
 * modifications without assignment involvement are excluded when employeeIds are set.
 */
export const buildChangeEmployeeClause = (
  employeeIds: string[],
): { clause: string; apply: (request: sql.Request) => void } | null => {
  if (employeeIds.length === 0) {
    return null;
  }
  const replaced = createUuidInFilter({
    column: "ce_emp.replaced_employee_id",
    parameterPrefix: "chgEmpRep",
    values: employeeIds,
  });
  const replacement = createUuidInFilter({
    column: "ce_emp.replacement_employee_id",
    parameterPrefix: "chgEmp",
    values: employeeIds,
  });
  if (!replaced || !replacement) {
    return null;
  }
  return {
    clause: `(
      ch.change_action = N'ASSIGNMENT_CHANGE'
      AND EXISTS (
        SELECT 1
        FROM operation_coverage_events ce_emp
        WHERE ce_emp.company_id = ch.company_id
          AND ce_emp.operation_id = ch.operation_id
          AND (${replaced.clause} OR ${replacement.clause})
      )
    )`,
    apply: (request) => {
      replaced.apply(request);
      replacement.apply(request);
    },
  };
};

export const scopeAndClause = (filters: SqlFilter[]): string =>
  filters.length ? `AND ${filters.map((f) => f.clause).join(" AND ")}` : "";

export const bindIncidentFilterHelpers = (
  request: sql.Request,
  helpers: Array<{ apply: (request: sql.Request) => void } | null | undefined>,
): void => {
  for (const helper of helpers) {
    helper?.apply(request);
  }
};

export const applyOperationScopeFilters = (
  request: sql.Request,
  filters: SqlFilter[],
): void => {
  applySqlFilters(request, filters);
};

/**
 * Company-local operational date for ONE_TIME confirmation rows.
 * Prefer operation workday work_date; else convert DATETIME2 scheduled_start via
 * SQL Server AT TIME ZONE (UTC → company Windows zone via dbo.fn_resolve_operation_timezone_for_sql).
 */
export const CONFIRMATION_OPERATIONAL_DATE_SQL = `
  COALESCE(
    (
      SELECT TOP 1 ow_conf.work_date
      FROM operation_workdays ow_conf
      WHERE ow_conf.company_id = o.company_id
        AND ow_conf.operation_id = o.id
      ORDER BY ow_conf.work_date ASC
    ),
    CAST(
      (o.scheduled_start AT TIME ZONE N'UTC')
        AT TIME ZONE dbo.fn_resolve_operation_timezone_for_sql(@companyTimeZone)
      AS DATE
    )
  )
`;
