import sql from "mssql";
import { getPool } from "../database/connection";
import type { StatisticsTableQuery } from "../schemas/statistics.schema";
import type { OperationalIncidentDetailRow } from "../types/statistics";
import {
  OPERATIONAL_INCIDENT_LABELS,
  PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL,
  type OperationalIncidentType,
} from "../utils/operational-incident-statistics";
import {
  applyOperationScopeFilters,
  bindIncidentFilterHelpers,
  buildChangeEmployeeClause,
  buildConfirmationEmployeeClause,
  buildCoverageEmployeeClause,
  buildDateRangeClause,
  buildOperationScopeFilters,
  buildPunchEmployeeClause,
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

export const operationalIncidentDetailsRepository = {
  async getIncidentDetails(
    companyId: string,
    query: StatisticsTableQuery,
    referenceAt: Date,
    companyTimeZone: string,
  ): Promise<{ data: OperationalIncidentDetailRow[]; total: number }> {
    const filters = query;
    const pool = getPool();
    const workdayFilters = buildEmployeeWorkdayStatisticsFilters(companyId, filters);
    const workdayWhere = buildStatisticsWhereFromFilters(workdayFilters);
    const workdayCte = buildEmployeeWorkdayStatisticsCte(workdayWhere);
    const scopeFilters = buildOperationScopeFilters(companyId, filters, {
      includeCompanyBind: false,
    });
    const scopeAnd = scopeAndClause(scopeFilters);

    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;
    const employeeIds = filters.employeeIds ?? [];

    const requested = filters.incidentType;
    const include = (type: OperationalIncidentType) =>
      !requested ||
      requested === type ||
      (requested === "NOT_CONFIRMED" && type === "NOT_CONFIRMED_AND_ABSENT") ||
      (requested === "NOT_CONFIRMED_AND_ABSENT" && type === "NOT_CONFIRMED");

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
    const punchEmp = buildPunchEmployeeClause(employeeIds);

    const request = pool.request();
    applyEmployeeWorkdayStatisticsFilters(request, workdayFilters, referenceAt);
    applyOperationScopeFilters(request, scopeFilters);
    request.input("companyTimeZone", sql.NVarChar(80), companyTimeZone);
    coverageDate.apply(request);
    bindIncidentFilterHelpers(request, [coverageEmp, confirmEmp, changeEmp, punchEmp]);
    request.input("offset", sql.Int, offset);
    request.input("limit", sql.Int, limit);

    if (filters.confirmationStatus) {
      request.input("confirmationStatus", sql.NVarChar, filters.confirmationStatus);
    }
    if (filters.punchCompleteness) {
      request.input("punchCompleteness", sql.NVarChar, filters.punchCompleteness);
    }

    const coverageEmpClause = coverageEmp ? `AND ${coverageEmp.clause}` : "";
    const confirmEmpClause = confirmEmp ? `AND ${confirmEmp.clause}` : "";
    const changeEmpClause = changeEmp ? `AND ${changeEmp.clause}` : "";
    const punchEmpClause = punchEmp ? `AND ${punchEmp.clause}` : "";
    const confirmStatusClause = filters.confirmationStatus
      ? "AND oa.confirmation_status = @confirmationStatus"
      : "";
    const punchCompletenessClause = filters.punchCompleteness
      ? `AND (${PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL}) = @punchCompleteness`
      : "";

    const unions: string[] = [];

    if (include("COVERAGE_REQUIRED") && (!requested || requested === "COVERAGE_REQUIRED")) {
      unions.push(`
        SELECT
          N'COVERAGE_REQUIRED' AS incident_type,
          ce.operation_id,
          ce.operational_date AS operational_date,
          s.name AS service_name,
          s.address AS service_address,
          o.status AS operation_status,
          o.operation_kind,
          wt.name AS work_team_name,
          ce.replaced_employee_id AS employee_id,
          er.name AS employee_name,
          CAST(NULL AS nvarchar(20)) AS confirmation_status,
          CAST(NULL AS datetimeoffset) AS check_in_at,
          CAST(NULL AS datetimeoffset) AS check_out_at,
          ce.occurred_at AS event_at,
          ce.source_type AS origin,
          ce.reason AS reason,
          ce.resolved_by_user_id AS actor_user_id,
          CASE WHEN actor_m.user_id IS NOT NULL THEN actor.name ELSE NULL END AS actor_name,
          ce.id AS detail_id
        FROM operation_coverage_events ce
        INNER JOIN scheduled_operations o
          ON o.id = ce.operation_id AND o.company_id = ce.company_id
        INNER JOIN operational_locations s
          ON s.id = o.service_id AND s.company_id = o.company_id
        LEFT JOIN work_teams wt
          ON wt.id = ce.work_team_id AND wt.company_id = ce.company_id
        LEFT JOIN employees er
          ON er.id = ce.replaced_employee_id AND er.company_id = ce.company_id
        LEFT JOIN users actor
          ON actor.id = ce.resolved_by_user_id
        LEFT JOIN user_company_memberships actor_m
          ON actor_m.user_id = actor.id AND actor_m.company_id = ce.company_id
        WHERE ce.company_id = @companyId
          AND ${coverageDate.clause}
          ${scopeAnd}
          ${coverageEmpClause}
      `);
    }

    if (include("OPERATION_MODIFIED") && (!requested || requested === "OPERATION_MODIFIED")) {
      unions.push(`
        SELECT
          N'OPERATION_MODIFIED' AS incident_type,
          ch.operation_id,
          ch.operational_date,
          s.name AS service_name,
          s.address AS service_address,
          o.status AS operation_status,
          o.operation_kind,
          CAST(NULL AS nvarchar(200)) AS work_team_name,
          CAST(NULL AS uniqueidentifier) AS employee_id,
          CAST(NULL AS nvarchar(200)) AS employee_name,
          CAST(NULL AS nvarchar(20)) AS confirmation_status,
          CAST(NULL AS datetimeoffset) AS check_in_at,
          CAST(NULL AS datetimeoffset) AS check_out_at,
          ch.occurred_at AS event_at,
          ch.change_action AS origin,
          ch.changed_fields_json AS reason,
          ch.actor_user_id AS actor_user_id,
          CASE WHEN actor_m.user_id IS NOT NULL THEN actor.name ELSE NULL END AS actor_name,
          ch.id AS detail_id
        FROM operation_change_events ch
        INNER JOIN scheduled_operations o
          ON o.id = ch.operation_id AND o.company_id = ch.company_id
        INNER JOIN operational_locations s
          ON s.id = o.service_id AND s.company_id = o.company_id
        LEFT JOIN users actor
          ON actor.id = ch.actor_user_id
        LEFT JOIN user_company_memberships actor_m
          ON actor_m.user_id = actor.id AND actor_m.company_id = ch.company_id
        WHERE ch.company_id = @companyId
          AND ch.source = N'HUMAN_API'
          AND ${changeDate.clause}
          ${scopeAnd}
          ${changeEmpClause}
      `);
    }

    if (
      !requested ||
      requested === "NOT_CONFIRMED" ||
      requested === "NOT_CONFIRMED_AND_ABSENT"
    ) {
      unions.push(`
        SELECT
          CASE
            WHEN EXISTS (
              SELECT 1 FROM employee_workday_statistics ews
              WHERE ews.operation_id = oa.operation_id
                AND ews.employee_id = oa.employee_id
                AND ews.effective_state = N'ABSENT'
            ) THEN N'NOT_CONFIRMED_AND_ABSENT'
            ELSE N'NOT_CONFIRMED'
          END AS incident_type,
          oa.operation_id,
          (${CONFIRMATION_OPERATIONAL_DATE_SQL}) AS operational_date,
          s.name AS service_name,
          s.address AS service_address,
          o.status AS operation_status,
          o.operation_kind,
          wt.name AS work_team_name,
          oa.employee_id,
          e.name AS employee_name,
          oa.confirmation_status,
          CAST(NULL AS datetimeoffset) AS check_in_at,
          CAST(NULL AS datetimeoffset) AS check_out_at,
          o.scheduled_start AS event_at,
          N'CONFIRMATION' AS origin,
          CAST(NULL AS nvarchar(500)) AS reason,
          CAST(NULL AS uniqueidentifier) AS actor_user_id,
          CAST(NULL AS nvarchar(200)) AS actor_name,
          oa.id AS detail_id
        FROM operation_assignments oa
        INNER JOIN scheduled_operations o
          ON o.id = oa.operation_id AND o.company_id = oa.company_id
        INNER JOIN operational_locations s
          ON s.id = o.service_id AND s.company_id = o.company_id
        INNER JOIN employees e
          ON e.id = oa.employee_id AND e.company_id = oa.company_id
        LEFT JOIN work_teams wt
          ON wt.id = oa.source_work_team_id AND wt.company_id = oa.company_id
        WHERE oa.company_id = @companyId
          AND oa.confirmation_status = N'PENDING'
          AND oa.cancelled_at IS NULL
          AND o.status <> N'CANCELLED'
          AND o.operation_kind = N'ONE_TIME'
          AND o.scheduled_start IS NOT NULL
          AND @referenceAt >= o.scheduled_start
          AND ${confirmDate.clause}
          ${scopeAnd}
          ${confirmEmpClause}
          ${confirmStatusClause}
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
            SELECT 1 FROM operation_coverage_events ce
            WHERE ce.company_id = oa.company_id
              AND ce.operation_id = oa.operation_id
              AND ce.replaced_assignment_id = oa.id
          )
      `);
    }

    const punchRequested =
      !requested ||
      requested === "MISSING_CHECK_IN" ||
      requested === "MISSING_CHECK_OUT" ||
      requested === "NO_PUNCH";
    if (punchRequested) {
      const punchList = (
        requested
          ? [requested]
          : (["MISSING_CHECK_IN", "MISSING_CHECK_OUT", "NO_PUNCH"] as const)
      )
        .filter((t) =>
          ["MISSING_CHECK_IN", "MISSING_CHECK_OUT", "NO_PUNCH"].includes(t),
        )
        .map((t) => `N'${t}'`)
        .join(", ");

      if (punchList) {
        unions.push(`
          SELECT
            (${PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL}) AS incident_type,
            operation_id,
            work_date AS operational_date,
            service_name,
            service_address,
            operation_status,
            operation_kind,
            CAST(NULL AS nvarchar(200)) AS work_team_name,
            employee_id,
            employee_name,
            CAST(NULL AS nvarchar(20)) AS confirmation_status,
            check_in_at,
            check_out_at,
            COALESCE(check_out_at, check_in_at, expected_end_at) AS event_at,
            N'PUNCH' AS origin,
            CAST(NULL AS nvarchar(500)) AS reason,
            CAST(NULL AS uniqueidentifier) AS actor_user_id,
            CAST(NULL AS nvarchar(200)) AS actor_name,
            employee_workday_id AS detail_id
          FROM employee_workday_statistics
          WHERE (${PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL}) IN (${punchList})
            ${punchEmpClause}
            ${punchCompletenessClause}
        `);
      }
    }

    if (unions.length === 0) {
      return { data: [], total: 0 };
    }

    let postFilter = "";
    if (requested === "NOT_CONFIRMED") {
      postFilter = "WHERE incident_type = N'NOT_CONFIRMED'";
    } else if (requested === "NOT_CONFIRMED_AND_ABSENT") {
      postFilter = "WHERE incident_type = N'NOT_CONFIRMED_AND_ABSENT'";
    }

    const result = await request.query(`
      ${workdayCte}
      , incident_rows AS (
        ${unions.join("\n UNION ALL \n")}
      )
      SELECT *, COUNT(1) OVER() AS total_count
      FROM incident_rows
      ${postFilter}
      ORDER BY operational_date DESC, incident_type ASC, detail_id ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const total = result.recordset.length
      ? toNumber((result.recordset[0] as Record<string, unknown>).total_count)
      : 0;

    const data: OperationalIncidentDetailRow[] = result.recordset.map((raw) => {
      const row = raw as Record<string, unknown>;
      const incidentType = String(row.incident_type) as OperationalIncidentType;
      return {
        detailId: String(row.detail_id),
        incidentType,
        incidentLabel: OPERATIONAL_INCIDENT_LABELS[incidentType] ?? incidentType,
        operationId: String(row.operation_id),
        operationalDate: String(row.operational_date).slice(0, 10),
        serviceName: String(row.service_name ?? ""),
        serviceAddress: row.service_address ? String(row.service_address) : null,
        workTeamName: row.work_team_name ? String(row.work_team_name) : null,
        employeeId: row.employee_id ? String(row.employee_id) : null,
        employeeName: row.employee_name ? String(row.employee_name) : null,
        operationStatus: String(row.operation_status ?? ""),
        operationKind: String(row.operation_kind ?? ""),
        confirmationStatus: row.confirmation_status
          ? String(row.confirmation_status)
          : null,
        checkInAt: row.check_in_at ? new Date(String(row.check_in_at)).toISOString() : null,
        checkOutAt: row.check_out_at
          ? new Date(String(row.check_out_at)).toISOString()
          : null,
        eventAt: row.event_at ? new Date(String(row.event_at)).toISOString() : null,
        origin: row.origin ? String(row.origin) : null,
        reason: row.reason ? String(row.reason) : null,
        actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
        actorName: row.actor_name ? String(row.actor_name) : null,
      };
    });

    return { data, total };
  },
};
