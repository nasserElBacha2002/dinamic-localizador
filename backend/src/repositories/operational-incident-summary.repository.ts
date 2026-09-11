import sql from "mssql";
import { getPool } from "../database/connection";
import type { StatisticsFilters } from "../schemas/statistics.schema";
import type { OperationalIncidentSummaryMetrics } from "../types/statistics";
import {
  emptyOperationalIncidentSummary,
  PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL,
} from "../utils/operational-incident-statistics";
import {
  applyOperationScopeFilters,
  bindIncidentFilterHelpers,
  buildChangeEmployeeClause,
  buildConfirmationEmployeeClause,
  buildCoverageEmployeeClause,
  buildDateRangeClause,
  buildOperationScopeFilters,
  CONFIRMATION_OPERATIONAL_DATE_SQL,
  scopeAndClause,
} from "../utils/operational-incident-filters";
import {
  applyEmployeeWorkdayStatisticsFilters,
  buildEmployeeWorkdayStatisticsCte,
  buildEmployeeWorkdayStatisticsFilters,
  buildStatisticsWhereFromFilters,
} from "../utils/employee-workday-statistics-projection";

const toNumber = (value: unknown): number => Number(value ?? 0);

const mapSummary = (row: Record<string, unknown>): OperationalIncidentSummaryMetrics => ({
  availability: "AVAILABLE",
  operationsWithAnyIncident: toNumber(row.operations_with_any_incident),
  operationsWithCoverage: toNumber(row.operations_with_coverage),
  coverageEvents: toNumber(row.coverage_events),
  modifiedOperations: toNumber(row.modified_operations),
  operationChangeEvents: toNumber(row.operation_change_events),
  operationsWithUnconfirmedAssignments: toNumber(row.operations_with_unconfirmed),
  notConfirmedBeforeStart: toNumber(row.not_confirmed_before_start),
  notConfirmedAndAbsent: toNumber(row.not_confirmed_and_absent),
  operationsWithIncompletePunches: toNumber(row.operations_with_incomplete_punches),
  incompleteWorkdays: toNumber(row.incomplete_workdays),
  missingCheckIn: toNumber(row.missing_check_in),
  missingCheckOut: toNumber(row.missing_check_out),
  noPunch: toNumber(row.no_punch),
  evaluableOperations: toNumber(row.evaluable_operations),
  confirmationEligibleAssignments: toNumber(row.confirmation_eligible_assignments),
  punchEvaluableWorkdays: toNumber(row.punch_evaluable_workdays),
  changeTraceableOperations: toNumber(row.change_traceable_operations),
  changeEventsReliableFrom: row.change_events_reliable_from
    ? String(row.change_events_reliable_from).slice(0, 10)
    : null,
  coverageReliableFrom: row.coverage_reliable_from
    ? String(row.coverage_reliable_from).slice(0, 10)
    : null,
  coverageEventsReliableHistorically: Boolean(row.coverage_events_reliable_historically),
});

export const operationalIncidentSummaryRepository = {
  async getSummaryMetrics(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
    companyTimeZone: string,
  ): Promise<OperationalIncidentSummaryMetrics> {
    const pool = getPool();
    const workdayFilters = buildEmployeeWorkdayStatisticsFilters(companyId, filters);
    const workdayWhere = buildStatisticsWhereFromFilters(workdayFilters);
    const workdayCte = buildEmployeeWorkdayStatisticsCte(workdayWhere);
    const scopeFilters = buildOperationScopeFilters(companyId, filters, {
      includeCompanyBind: false,
    });
    const scopeAnd = scopeAndClause(scopeFilters);

    const employeeIds = filters.employeeIds ?? [];
    const hasFrom = Boolean(filters.dateFrom);
    const coverageDate = buildDateRangeClause("ce.operational_date", filters, "incidentDate");
    const changeDate = buildDateRangeClause("ch.operational_date", filters, "incidentDate");
    const confirmDate = buildDateRangeClause(
      `(${CONFIRMATION_OPERATIONAL_DATE_SQL})`,
      filters,
      "incidentDate",
    );

    const coverageEmp = buildCoverageEmployeeClause(employeeIds);
    const confirmEmp = buildConfirmationEmployeeClause(employeeIds);
    const changeEmp = buildChangeEmployeeClause(employeeIds);

    const request = pool.request();
    applyEmployeeWorkdayStatisticsFilters(request, workdayFilters, referenceAt);
    applyOperationScopeFilters(request, scopeFilters);
    request.input("companyTimeZone", sql.NVarChar(80), companyTimeZone);
    coverageDate.apply(request);
    bindIncidentFilterHelpers(request, [coverageEmp, confirmEmp, changeEmp]);

    if (filters.confirmationStatus) {
      request.input("confirmationStatus", sql.NVarChar, filters.confirmationStatus);
    }
    if (filters.punchCompleteness) {
      request.input("punchCompleteness", sql.NVarChar, filters.punchCompleteness);
    }

    const coverageEmpClause = coverageEmp ? `AND ${coverageEmp.clause}` : "";
    const confirmEmpClause = confirmEmp ? `AND ${confirmEmp.clause}` : "";
    const changeEmpClause = changeEmp ? `AND ${changeEmp.clause}` : "";
    const punchFilterClause = filters.punchCompleteness
      ? "AND punch_category = @punchCompleteness"
      : "";

    const coverageHistoricallySql = hasFrom
      ? `CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM operation_coverage_events WHERE company_id = @companyId
            ) THEN CAST(0 AS bit)
            WHEN EXISTS (
              SELECT 1
              FROM operation_coverage_events
              WHERE company_id = @companyId
                AND source_type = N'ABSENCE_ASSIGN_REPLACEMENT'
            ) THEN CAST(1 AS bit)
            WHEN @incidentDateFrom >= (
              SELECT CAST(MIN(created_at) AS DATE)
              FROM operation_coverage_events
              WHERE company_id = @companyId
            ) THEN CAST(1 AS bit)
            ELSE CAST(0 AS bit)
          END`
      : `CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM operation_coverage_events WHERE company_id = @companyId
            ) THEN CAST(0 AS bit)
            WHEN EXISTS (
              SELECT 1
              FROM operation_coverage_events
              WHERE company_id = @companyId
                AND source_type = N'ABSENCE_ASSIGN_REPLACEMENT'
            ) THEN CAST(1 AS bit)
            ELSE CAST(1 AS bit)
          END`;

    const result = await request.query(`
      ${workdayCte}
      ,
      incomplete_punches AS (
        SELECT
          operation_id,
          (${PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL}) AS punch_category
        FROM employee_workday_statistics
      ),
      punch_evaluable AS (
        SELECT *
        FROM incomplete_punches
        WHERE punch_category IS NOT NULL
      ),
      incomplete_only AS (
        SELECT *
        FROM punch_evaluable
        WHERE punch_category IN (N'MISSING_CHECK_IN', N'MISSING_CHECK_OUT', N'NO_PUNCH')
        ${punchFilterClause}
      ),
      coverage_ops AS (
        SELECT ce.operation_id, ce.id AS event_id
        FROM operation_coverage_events ce
        INNER JOIN scheduled_operations o
          ON o.id = ce.operation_id AND o.company_id = ce.company_id
        WHERE ce.company_id = @companyId
          AND ${coverageDate.clause}
          ${scopeAnd}
          ${coverageEmpClause}
      ),
      change_ops AS (
        SELECT ch.operation_id, ch.id AS event_id
        FROM operation_change_events ch
        INNER JOIN scheduled_operations o
          ON o.id = ch.operation_id AND o.company_id = ch.company_id
        WHERE ch.company_id = @companyId
          AND ch.source = N'HUMAN_API'
          AND ${changeDate.clause}
          ${scopeAnd}
          ${changeEmpClause}
      ),
      confirm_base AS (
        SELECT
          oa.id AS assignment_id,
          oa.operation_id,
          oa.employee_id,
          oa.confirmation_status
        FROM operation_assignments oa
        INNER JOIN scheduled_operations o
          ON o.id = oa.operation_id AND o.company_id = oa.company_id
        WHERE oa.company_id = @companyId
          AND oa.cancelled_at IS NULL
          AND o.status <> N'CANCELLED'
          AND o.operation_kind = N'ONE_TIME'
          AND o.scheduled_start IS NOT NULL
          AND @referenceAt >= o.scheduled_start
          AND ${confirmDate.clause}
          ${scopeAnd}
          ${confirmEmpClause}
          AND NOT EXISTS (
            SELECT 1
            FROM employee_workdays ew
            INNER JOIN operation_workdays ow
              ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
            WHERE ew.company_id = oa.company_id
              AND ew.employee_id = oa.employee_id
              AND ow.operation_id = oa.operation_id
              AND ew.expectation_status = N'JUSTIFIED'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM operation_coverage_events ce
            WHERE ce.company_id = oa.company_id
              AND ce.operation_id = oa.operation_id
              AND ce.replaced_assignment_id = oa.id
          )
      ),
      confirm_eligible AS (
        SELECT *
        FROM confirm_base
      ),
      confirm_rows AS (
        SELECT
          cb.assignment_id,
          cb.operation_id,
          cb.employee_id,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM employee_workday_statistics ews
              WHERE ews.operation_id = cb.operation_id
                AND ews.employee_id = cb.employee_id
                AND ews.effective_state = N'ABSENT'
            ) THEN 1
            ELSE 0
          END AS is_absent
        FROM confirm_base cb
        WHERE cb.confirmation_status = N'PENDING'
          ${
            filters.confirmationStatus
              ? "AND cb.confirmation_status = @confirmationStatus"
              : ""
          }
      ),
      any_incident_ops AS (
        SELECT operation_id FROM coverage_ops
        UNION
        SELECT operation_id FROM change_ops
        UNION
        SELECT operation_id FROM confirm_rows
        UNION
        SELECT operation_id FROM incomplete_only
      ),
      reliability AS (
        SELECT
          (
            SELECT CONVERT(varchar(10), MIN(created_at), 23)
            FROM operation_change_events
            WHERE company_id = @companyId
          ) AS change_events_reliable_from,
          (
            SELECT CONVERT(varchar(10), MIN(created_at), 23)
            FROM operation_coverage_events
            WHERE company_id = @companyId
          ) AS coverage_reliable_from,
          (${coverageHistoricallySql}) AS coverage_events_reliable_historically
      )
      SELECT
        (SELECT COUNT(DISTINCT operation_id) FROM any_incident_ops) AS operations_with_any_incident,
        (SELECT COUNT(DISTINCT operation_id) FROM coverage_ops) AS operations_with_coverage,
        (SELECT COUNT(*) FROM coverage_ops) AS coverage_events,
        (SELECT COUNT(DISTINCT operation_id) FROM change_ops) AS modified_operations,
        (SELECT COUNT(*) FROM change_ops) AS operation_change_events,
        (SELECT COUNT(DISTINCT operation_id) FROM confirm_rows) AS operations_with_unconfirmed,
        (SELECT COUNT(*) FROM confirm_rows) AS not_confirmed_before_start,
        (SELECT COUNT(*) FROM confirm_rows WHERE is_absent = 1) AS not_confirmed_and_absent,
        (SELECT COUNT(DISTINCT operation_id) FROM incomplete_only)
          AS operations_with_incomplete_punches,
        (SELECT COUNT(*) FROM incomplete_only) AS incomplete_workdays,
        (SELECT COUNT(*) FROM incomplete_only WHERE punch_category = N'MISSING_CHECK_IN')
          AS missing_check_in,
        (SELECT COUNT(*) FROM incomplete_only WHERE punch_category = N'MISSING_CHECK_OUT')
          AS missing_check_out,
        (SELECT COUNT(*) FROM incomplete_only WHERE punch_category = N'NO_PUNCH') AS no_punch,
        (
          SELECT COUNT(DISTINCT operation_id)
          FROM employee_workday_statistics
          WHERE effective_state <> N'CANCELLED'
        ) AS evaluable_operations,
        (SELECT COUNT(*) FROM confirm_eligible) AS confirmation_eligible_assignments,
        (SELECT COUNT(*) FROM punch_evaluable) AS punch_evaluable_workdays,
        CASE
          WHEN (SELECT change_events_reliable_from FROM reliability) IS NULL THEN 0
          ELSE (
            SELECT COUNT(DISTINCT operation_id)
            FROM employee_workday_statistics
            WHERE effective_state <> N'CANCELLED'
              AND work_date >= CAST((SELECT change_events_reliable_from FROM reliability) AS DATE)
          )
        END AS change_traceable_operations,
        (SELECT change_events_reliable_from FROM reliability) AS change_events_reliable_from,
        (SELECT coverage_reliable_from FROM reliability) AS coverage_reliable_from,
        (SELECT coverage_events_reliable_historically FROM reliability)
          AS coverage_events_reliable_historically
    `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return emptyOperationalIncidentSummary();
    }
    return mapSummary(row);
  },
};
