import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationKind } from "../constants/operation-kind";
import type { OperationStatus } from "../types/domain";
import { toDateOnlyString } from "../utils/row-mappers";
import type {
  DeactivationAssignmentSnapshot,
  DeactivationReleasePlan,
  DeactivationWorkdaySnapshot,
} from "../utils/employee-deactivation-impact";

const mapWorkday = (row: Record<string, unknown>): DeactivationWorkdaySnapshot => ({
  employeeWorkdayId: String(row.employee_workday_id),
  operationWorkdayId: String(row.operation_workday_id),
  workDate: toDateOnlyString(row.work_date as Date | string),
  expectationStatus: String(row.expectation_status),
  hasAttendance: Boolean(row.has_attendance),
  expectedStartAt: row.expected_start_at
    ? new Date(row.expected_start_at as Date | string).toISOString()
    : null,
  expectedEndAt: row.expected_end_at
    ? new Date(row.expected_end_at as Date | string).toISOString()
    : null,
});

export const employeeDeactivationRepository = {
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
        FROM employees WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
        WHERE company_id = @companyId AND id = @employeeId
      `);

    const row = result.recordset[0] as { id: string; active: boolean | number } | undefined;
    if (!row) {
      return null;
    }
    return { id: String(row.id), active: Boolean(row.active) };
  },

  async listAssignmentSnapshots(
    companyId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<DeactivationAssignmentSnapshot[]> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const assignmentResult = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT
          oa.id AS assignment_id,
          o.id AS operation_id,
          o.operation_kind,
          o.status AS operation_status,
          o.notes AS operation_notes,
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
          AND o.status NOT IN (N'CANCELLED', N'COMPLETED')
      `);

    const assignments = assignmentResult.recordset as Array<Record<string, unknown>>;
    if (assignments.length === 0) {
      return [];
    }

    const workdayRequest = transaction ? new sql.Request(transaction) : getPool().request();
    workdayRequest.input("companyId", sql.UniqueIdentifier, companyId);
    workdayRequest.input("employeeId", sql.UniqueIdentifier, employeeId);
    const idParams = assignments.map((row, index) => {
      const param = `assignmentId${index}`;
      workdayRequest.input(param, sql.UniqueIdentifier, String(row.assignment_id));
      return `@${param}`;
    });

    const workdayResult = await workdayRequest.query(`
      SELECT
        ew.id AS employee_workday_id,
        ew.operation_assignment_id,
        ew.operation_workday_id,
        ew.expectation_status,
        ow.work_date,
        ow.expected_start_at,
        ow.expected_end_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM attendance_records ar
          WHERE ar.company_id = ew.company_id
            AND ar.employee_workday_id = ew.id
        ) THEN 1 ELSE 0 END AS has_attendance
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
      WHERE ew.company_id = @companyId
        AND ew.employee_id = @employeeId
        AND ew.operation_assignment_id IN (${idParams.join(", ")})
    `);

    const workdaysByAssignment = new Map<string, DeactivationWorkdaySnapshot[]>();
    for (const row of workdayResult.recordset as Array<Record<string, unknown>>) {
      const assignmentId = String(row.operation_assignment_id);
      const list = workdaysByAssignment.get(assignmentId) ?? [];
      list.push(mapWorkday(row));
      workdaysByAssignment.set(assignmentId, list);
    }

    return assignments.map((row) => ({
      assignmentId: String(row.assignment_id),
      operationId: String(row.operation_id),
      operationKind: String(row.operation_kind) as OperationKind,
      operationStatus: String(row.operation_status) as OperationStatus,
      operationNotes: row.operation_notes ? String(row.operation_notes) : null,
      locationName: String(row.location_name ?? ""),
      workTeamName: row.work_team_name ? String(row.work_team_name) : null,
      scheduledStart: row.scheduled_start
        ? new Date(row.scheduled_start as Date | string).toISOString()
        : null,
      scheduledEnd: row.scheduled_end
        ? new Date(row.scheduled_end as Date | string).toISOString()
        : null,
      validFrom: toDateOnlyString(row.valid_from as Date | string),
      validUntil: row.valid_until ? toDateOnlyString(row.valid_until as Date | string) : null,
      cancelledAt: null,
      workdays: workdaysByAssignment.get(String(row.assignment_id)) ?? [],
    }));
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

  async executeReleasePlan(
    companyId: string,
    employeeId: string,
    plan: DeactivationReleasePlan,
    transaction: sql.Transaction,
  ): Promise<void> {
    if (plan.employeeWorkdayIdsToCancel.length > 0) {
      const request = new sql.Request(transaction).input(
        "companyId",
        sql.UniqueIdentifier,
        companyId,
      );
      const params = plan.employeeWorkdayIdsToCancel.map((id, index) => {
        const param = `ewId${index}`;
        request.input(param, sql.UniqueIdentifier, id);
        return `@${param}`;
      });

      await request.query(`
        UPDATE employee_workdays
        SET expectation_status = N'CANCELLED',
            cancellation_reason = N'ASSIGNMENT',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id IN (${params.join(", ")})
          AND expectation_status = N'EXPECTED'
      `);
    }

    for (const assignmentId of plan.assignmentsToCancel) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .query(`
          UPDATE operation_assignments
          SET cancelled_at = SYSUTCDATETIME(),
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId
            AND id = @assignmentId
            AND cancelled_at IS NULL
        `);
    }

    for (const item of plan.assignmentsToEnd) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("assignmentId", sql.UniqueIdentifier, item.assignmentId)
        .input("effectiveDate", sql.Date, item.effectiveDate)
        .query(`
          UPDATE operation_assignments
          SET valid_until = @effectiveDate,
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId
            AND id = @assignmentId
            AND cancelled_at IS NULL
            AND (valid_until IS NULL OR valid_until > @effectiveDate)
            AND valid_from <= @effectiveDate
        `);
    }
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

  async findPhoneConflictInTransaction(
    companyId: string,
    employeeId: string,
    phoneNumber: string,
    transaction: sql.Transaction,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        SELECT TOP 1 1 AS found
        FROM employees WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND phone_number = @phoneNumber
          AND id <> @employeeId
      `);
    return Boolean(result.recordset[0]);
  },
};
