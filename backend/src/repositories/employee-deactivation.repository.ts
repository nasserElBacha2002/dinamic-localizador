import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationKind } from "../constants/operation-kind";
import type { OperationStatus } from "../types/domain";
import { toDateOnlyString } from "../utils/row-mappers";
import type { DeactivationImpactCandidate } from "../utils/employee-deactivation-impact";

const mapCandidate = (row: Record<string, unknown>): DeactivationImpactCandidate => ({
  assignmentId: String(row.assignment_id),
  operationId: String(row.operation_id),
  operationKind: String(row.operation_kind) as OperationKind,
  operationStatus: String(row.operation_status) as OperationStatus,
  workdayId: row.workday_id ? String(row.workday_id) : null,
  employeeWorkdayId: row.employee_workday_id ? String(row.employee_workday_id) : null,
  date: row.work_date ? toDateOnlyString(row.work_date as Date | string) : null,
  expectedStartAt: row.expected_start_at
    ? new Date(row.expected_start_at as Date | string).toISOString()
    : null,
  expectedEndAt: row.expected_end_at
    ? new Date(row.expected_end_at as Date | string).toISOString()
    : null,
  scheduledStart: row.scheduled_start
    ? new Date(row.scheduled_start as Date | string).toISOString()
    : null,
  scheduledEnd: row.scheduled_end
    ? new Date(row.scheduled_end as Date | string).toISOString()
    : null,
  assignmentValidFrom: toDateOnlyString(row.valid_from as Date | string),
  assignmentValidUntil: row.valid_until
    ? toDateOnlyString(row.valid_until as Date | string)
    : null,
  assignmentCancelledAt: row.cancelled_at
    ? new Date(row.cancelled_at as Date | string).toISOString()
    : null,
  locationName: String(row.location_name ?? ""),
  workTeamName: row.work_team_name ? String(row.work_team_name) : null,
});

export const employeeDeactivationRepository = {
  /**
   * Raw candidates for impact evaluation. Temporal filtering happens in the service
   * so unit tests can cover timezone/status edge cases without SQL.
   */
  async listImpactCandidates(
    companyId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<DeactivationImpactCandidate[]> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        -- Expected workdays still linked to non-cancelled assignments
        SELECT
          oa.id AS assignment_id,
          o.id AS operation_id,
          o.operation_kind,
          o.status AS operation_status,
          ow.id AS workday_id,
          ew.id AS employee_workday_id,
          ow.work_date,
          ow.expected_start_at,
          ow.expected_end_at,
          o.scheduled_start,
          o.scheduled_end,
          oa.valid_from,
          oa.valid_until,
          oa.cancelled_at,
          ol.name AS location_name,
          COALESCE(bt.work_team_name_snapshot, wt.name) AS work_team_name
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
        INNER JOIN scheduled_operations o
          ON o.id = ow.operation_id AND o.company_id = ew.company_id
        INNER JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
        INNER JOIN operational_locations ol
          ON ol.id = o.service_id AND ol.company_id = o.company_id
        LEFT JOIN work_teams wt
          ON wt.id = oa.source_work_team_id AND wt.company_id = @companyId
        LEFT JOIN work_team_assignment_batch_teams bt
          ON bt.batch_id = oa.source_assignment_batch_id
         AND bt.work_team_id = oa.source_work_team_id
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ew.expectation_status = N'EXPECTED'
          AND oa.cancelled_at IS NULL
          AND o.status NOT IN (N'CANCELLED', N'COMPLETED')

        UNION ALL

        -- Assignments without EXPECTED workdays (unmaterialized future ONE_TIME / open recurring)
        SELECT
          oa.id AS assignment_id,
          o.id AS operation_id,
          o.operation_kind,
          o.status AS operation_status,
          CAST(NULL AS UNIQUEIDENTIFIER) AS workday_id,
          CAST(NULL AS UNIQUEIDENTIFIER) AS employee_workday_id,
          CAST(NULL AS DATE) AS work_date,
          CAST(NULL AS DATETIME2) AS expected_start_at,
          CAST(NULL AS DATETIME2) AS expected_end_at,
          o.scheduled_start,
          o.scheduled_end,
          oa.valid_from,
          oa.valid_until,
          oa.cancelled_at,
          ol.name AS location_name,
          COALESCE(bt.work_team_name_snapshot, wt.name) AS work_team_name
        FROM operation_assignments oa
        INNER JOIN scheduled_operations o
          ON o.id = oa.operation_id AND o.company_id = oa.company_id
        INNER JOIN operational_locations ol
          ON ol.id = o.service_id AND ol.company_id = o.company_id
        LEFT JOIN work_teams wt
          ON wt.id = oa.source_work_team_id AND wt.company_id = @companyId
        LEFT JOIN work_team_assignment_batch_teams bt
          ON bt.batch_id = oa.source_assignment_batch_id
         AND bt.work_team_id = oa.source_work_team_id
        WHERE oa.company_id = @companyId
          AND oa.employee_id = @employeeId
          AND oa.cancelled_at IS NULL
          AND o.status IN (N'SCHEDULED', N'IN_PROGRESS')
          AND NOT EXISTS (
            SELECT 1
            FROM employee_workdays ew
            WHERE ew.company_id = @companyId
              AND ew.operation_assignment_id = oa.id
              AND ew.expectation_status = N'EXPECTED'
          )
      `);

    return result.recordset.map((row) => mapCandidate(row as Record<string, unknown>));
  },

  async lockEmployeeForUpdate(
    companyId: string,
    employeeId: string,
    transaction: sql.Transaction,
  ): Promise<{ id: string; active: boolean } | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT id, active
        FROM employees WITH (UPDLOCK, ROWLOCK)
        WHERE company_id = @companyId AND id = @employeeId
      `);

    const row = result.recordset[0] as { id: string; active: boolean | number } | undefined;
    if (!row) {
      return null;
    }
    return { id: String(row.id), active: Boolean(row.active) };
  },

  async listActiveWorkTeamMemberships(
    companyId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<Array<{ workTeamId: string; workTeamName: string }>> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT wt.id AS work_team_id, wt.name AS work_team_name
        FROM work_team_members wtm
        INNER JOIN work_teams wt ON wt.id = wtm.work_team_id AND wt.company_id = @companyId
        WHERE wtm.employee_id = @employeeId
          AND wt.is_active = 1
        ORDER BY wt.name ASC
      `);

    return result.recordset.map((row) => ({
      workTeamId: String((row as { work_team_id: string }).work_team_id),
      workTeamName: String((row as { work_team_name: string }).work_team_name),
    }));
  },

  async removeFromAllWorkTeams(
    companyId: string,
    employeeId: string,
    transaction: sql.Transaction,
  ): Promise<Array<{ workTeamId: string; workTeamName: string }>> {
    const memberships = await this.listActiveWorkTeamMemberships(
      companyId,
      employeeId,
      transaction,
    );

    if (memberships.length === 0) {
      return [];
    }

    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        DELETE wtm
        FROM work_team_members wtm
        INNER JOIN work_teams wt ON wt.id = wtm.work_team_id AND wt.company_id = @companyId
        WHERE wtm.employee_id = @employeeId
      `);

    return memberships;
  },
};
