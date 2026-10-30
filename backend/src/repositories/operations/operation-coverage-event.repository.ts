import sql from "mssql";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

export type CoverageEventSourceType = "ABSENCE_ASSIGN_REPLACEMENT" | "MANUAL_COVERAGE";

export type InsertCoverageEventInput = {
  companyId: string;
  operationId: string;
  operationalDate: string;
  sourceType: CoverageEventSourceType;
  sourceConflictId?: string | null;
  replacedAssignmentId?: string | null;
  replacedEmployeeId?: string | null;
  replacementAssignmentId?: string | null;
  replacementEmployeeId: string;
  absentEmployeeWorkdayId?: string | null;
  coverageCommandId?: string | null;
  workTeamId?: string | null;
  reason?: string | null;
  resolvedByUserId?: string | null;
  occurredAt?: Date;
};

export type ActiveWorkdayCoverageRow = {
  eventId: string;
  absentEmployeeWorkdayId: string;
  replacementEmployeeId: string;
  replacementEmployeeName: string | null;
  replacementAssignmentId: string | null;
  coverageCommandId: string | null;
};

const ACTIVE_COVERAGE_JOIN = `
  FROM operation_coverage_events oce
  LEFT JOIN operation_assignments repl
    ON repl.company_id = oce.company_id
   AND repl.id = oce.replacement_assignment_id
  LEFT JOIN employees e
    ON e.company_id = oce.company_id
   AND e.id = oce.replacement_employee_id
  WHERE oce.company_id = @companyId
    AND oce.superseded_at IS NULL
    AND (
      oce.replacement_assignment_id IS NULL
      OR repl.cancelled_at IS NULL
    )
`;

export const operationCoverageEventRepository = {
  async findActiveByEmployeeWorkdayId(
    companyId: string,
    absentEmployeeWorkdayId: string,
    transaction?: sql.Transaction,
  ): Promise<ActiveWorkdayCoverageRow | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absentEmployeeWorkdayId", sql.UniqueIdentifier, absentEmployeeWorkdayId)
      .query(`
        SELECT TOP 1
          oce.id AS event_id,
          oce.absent_employee_workday_id,
          oce.replacement_employee_id,
          e.name AS replacement_employee_name,
          oce.replacement_assignment_id,
          oce.coverage_command_id
        ${ACTIVE_COVERAGE_JOIN}
          AND oce.absent_employee_workday_id = @absentEmployeeWorkdayId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row?.event_id || !row.absent_employee_workday_id) {
      return null;
    }
    return {
      eventId: String(row.event_id),
      absentEmployeeWorkdayId: String(row.absent_employee_workday_id),
      replacementEmployeeId: String(row.replacement_employee_id),
      replacementEmployeeName: row.replacement_employee_name
        ? String(row.replacement_employee_name)
        : null,
      replacementAssignmentId: row.replacement_assignment_id
        ? String(row.replacement_assignment_id)
        : null,
      coverageCommandId: row.coverage_command_id ? String(row.coverage_command_id) : null,
    };
  },

  async findByCoverageCommandId(
    companyId: string,
    coverageCommandId: string,
    transaction?: sql.Transaction,
  ): Promise<ActiveWorkdayCoverageRow | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("coverageCommandId", sql.NVarChar(120), coverageCommandId)
      .query(`
        SELECT TOP 1
          oce.id AS event_id,
          oce.absent_employee_workday_id,
          oce.replacement_employee_id,
          e.name AS replacement_employee_name,
          oce.replacement_assignment_id,
          oce.coverage_command_id
        ${ACTIVE_COVERAGE_JOIN}
          AND oce.coverage_command_id = @coverageCommandId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row?.event_id) {
      return null;
    }
    return {
      eventId: String(row.event_id),
      absentEmployeeWorkdayId: row.absent_employee_workday_id
        ? String(row.absent_employee_workday_id)
        : "",
      replacementEmployeeId: String(row.replacement_employee_id),
      replacementEmployeeName: row.replacement_employee_name
        ? String(row.replacement_employee_name)
        : null,
      replacementAssignmentId: row.replacement_assignment_id
        ? String(row.replacement_assignment_id)
        : null,
      coverageCommandId: row.coverage_command_id ? String(row.coverage_command_id) : null,
    };
  },

  async listActiveCoverageByEmployeeWorkdayIds(
    companyId: string,
    employeeWorkdayIds: string[],
  ): Promise<Map<string, ActiveWorkdayCoverageRow>> {
    const map = new Map<string, ActiveWorkdayCoverageRow>();
    if (employeeWorkdayIds.length === 0) {
      return map;
    }
    const pool = getPool();
    const chunkSize = 100;
    for (let offset = 0; offset < employeeWorkdayIds.length; offset += chunkSize) {
      const chunk = employeeWorkdayIds.slice(offset, offset + chunkSize);
      const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
      const paramNames = chunk.map((id, index) => {
        const param = `employeeWorkdayId${index}`;
        request.input(param, sql.UniqueIdentifier, id);
        return `@${param}`;
      });
      const result = await request.query(`
        SELECT
          oce.id AS event_id,
          oce.absent_employee_workday_id,
          oce.replacement_employee_id,
          e.name AS replacement_employee_name,
          oce.replacement_assignment_id,
          oce.coverage_command_id
        ${ACTIVE_COVERAGE_JOIN}
          AND oce.absent_employee_workday_id IN (${paramNames.join(", ")})
      `);
      for (const row of result.recordset) {
        if (row.absent_employee_workday_id && row.replacement_employee_id) {
          map.set(String(row.absent_employee_workday_id), {
            eventId: String(row.event_id),
            absentEmployeeWorkdayId: String(row.absent_employee_workday_id),
            replacementEmployeeId: String(row.replacement_employee_id),
            replacementEmployeeName: row.replacement_employee_name
              ? String(row.replacement_employee_name)
              : null,
            replacementAssignmentId: row.replacement_assignment_id
              ? String(row.replacement_assignment_id)
              : null,
            coverageCommandId: row.coverage_command_id
              ? String(row.coverage_command_id)
              : null,
          });
        }
      }
    }
    return map;
  },

  /** Legacy fallback: assignment + operational_date (no workday id on event). */
  async findLegacyActiveByAssignmentAndDate(
    companyId: string,
    replacedAssignmentId: string,
    operationalDate: string,
  ): Promise<ActiveWorkdayCoverageRow | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("replacedAssignmentId", sql.UniqueIdentifier, replacedAssignmentId)
      .input("operationalDate", sql.Date, operationalDate)
      .query(`
        SELECT TOP 1
          oce.id AS event_id,
          oce.absent_employee_workday_id,
          oce.replacement_employee_id,
          e.name AS replacement_employee_name,
          oce.replacement_assignment_id,
          oce.coverage_command_id
        ${ACTIVE_COVERAGE_JOIN}
          AND oce.replaced_assignment_id = @replacedAssignmentId
          AND oce.operational_date = @operationalDate
          AND oce.absent_employee_workday_id IS NULL
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row?.event_id || !row.replacement_employee_id) {
      return null;
    }
    return {
      eventId: String(row.event_id),
      absentEmployeeWorkdayId: "",
      replacementEmployeeId: String(row.replacement_employee_id),
      replacementEmployeeName: row.replacement_employee_name
        ? String(row.replacement_employee_name)
        : null,
      replacementAssignmentId: row.replacement_assignment_id
        ? String(row.replacement_assignment_id)
        : null,
      coverageCommandId: row.coverage_command_id ? String(row.coverage_command_id) : null,
    };
  },

  async supersedeActiveForWorkdayInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    absentEmployeeWorkdayId: string,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absentEmployeeWorkdayId", sql.UniqueIdentifier, absentEmployeeWorkdayId)
      .query(`
        UPDATE operation_coverage_events
        SET superseded_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @absentEmployeeWorkdayId
          AND superseded_at IS NULL
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async insert(
    input: InsertCoverageEventInput,
    transaction?: sql.Transaction,
  ): Promise<{ inserted: boolean; eventId?: string }> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    try {
      const result = await request
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("operationalDate", sql.Date, input.operationalDate)
        .input("sourceType", sql.NVarChar(40), input.sourceType)
        .input("sourceConflictId", sql.UniqueIdentifier, input.sourceConflictId ?? null)
        .input("replacedAssignmentId", sql.UniqueIdentifier, input.replacedAssignmentId ?? null)
        .input("replacedEmployeeId", sql.UniqueIdentifier, input.replacedEmployeeId ?? null)
        .input(
          "replacementAssignmentId",
          sql.UniqueIdentifier,
          input.replacementAssignmentId ?? null,
        )
        .input("replacementEmployeeId", sql.UniqueIdentifier, input.replacementEmployeeId)
        .input(
          "absentEmployeeWorkdayId",
          sql.UniqueIdentifier,
          input.absentEmployeeWorkdayId ?? null,
        )
        .input("coverageCommandId", sql.NVarChar(120), input.coverageCommandId ?? null)
        .input("workTeamId", sql.UniqueIdentifier, input.workTeamId ?? null)
        .input("reason", sql.NVarChar(500), input.reason ?? null)
        .input("resolvedByUserId", sql.UniqueIdentifier, input.resolvedByUserId ?? null)
        .input("occurredAt", sql.DateTime2, input.occurredAt ?? new Date())
        .query(`
          IF @sourceConflictId IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM operation_coverage_events
               WHERE company_id = @companyId
                 AND source_conflict_id = @sourceConflictId
                 AND superseded_at IS NULL
             )
          BEGIN
            SELECT CAST(0 AS BIT) AS inserted, CAST(NULL AS UNIQUEIDENTIFIER) AS event_id;
            RETURN;
          END;

          DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);

          INSERT INTO operation_coverage_events (
            company_id, operation_id, operational_date, source_type,
            source_conflict_id, replaced_assignment_id, replaced_employee_id,
            replacement_assignment_id, replacement_employee_id, work_team_id,
            reason, resolved_by_user_id, occurred_at,
            absent_employee_workday_id, coverage_command_id
          )
          OUTPUT INSERTED.id INTO @inserted (id)
          VALUES (
            @companyId, @operationId, @operationalDate, @sourceType,
            @sourceConflictId, @replacedAssignmentId, @replacedEmployeeId,
            @replacementAssignmentId, @replacementEmployeeId, @workTeamId,
            @reason, @resolvedByUserId, @occurredAt,
            @absentEmployeeWorkdayId, @coverageCommandId
          );

          SELECT CAST(1 AS BIT) AS inserted, (SELECT TOP 1 id FROM @inserted) AS event_id;
        `);

      const inserted = Boolean(result.recordset?.[0]?.inserted);
      const eventId = result.recordset?.[0]?.event_id
        ? String(result.recordset[0].event_id)
        : undefined;
      return { inserted, eventId };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "COVERAGE_ALREADY_RECORDED",
          "Ya existe una cobertura activa para esa jornada",
        );
      }
      throw error;
    }
  },

  /** @deprecated Prefer workday-scoped lookups. Legacy ONE_TIME whole-assignment guard. */
  async existsForReplacedAssignment(
    companyId: string,
    replacedAssignmentId: string,
    transaction?: sql.Transaction,
  ): Promise<boolean> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("replacedAssignmentId", sql.UniqueIdentifier, replacedAssignmentId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM operation_coverage_events
        WHERE company_id = @companyId
          AND replaced_assignment_id = @replacedAssignmentId
          AND absent_employee_workday_id IS NULL
          AND superseded_at IS NULL
      `);
    return Boolean(result.recordset?.[0]);
  },
};
