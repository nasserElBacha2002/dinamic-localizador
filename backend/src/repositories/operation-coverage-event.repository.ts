import sql from "mssql";
import { getPool } from "../database/connection";

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
  workTeamId?: string | null;
  reason?: string | null;
  resolvedByUserId?: string | null;
  occurredAt?: Date;
};

export const operationCoverageEventRepository = {
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
      `);
    return Boolean(result.recordset?.[0]);
  },

  async insert(
    input: InsertCoverageEventInput,
    transaction?: sql.Transaction,
  ): Promise<{ inserted: boolean }> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
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
           )
        BEGIN
          SELECT CAST(0 AS BIT) AS inserted;
          RETURN;
        END;

        IF @replacedAssignmentId IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM operation_coverage_events
             WHERE company_id = @companyId
               AND replaced_assignment_id = @replacedAssignmentId
           )
        BEGIN
          SELECT CAST(0 AS BIT) AS inserted;
          RETURN;
        END;

        INSERT INTO operation_coverage_events (
          company_id, operation_id, operational_date, source_type,
          source_conflict_id, replaced_assignment_id, replaced_employee_id,
          replacement_assignment_id, replacement_employee_id, work_team_id,
          reason, resolved_by_user_id, occurred_at
        )
        VALUES (
          @companyId, @operationId, @operationalDate, @sourceType,
          @sourceConflictId, @replacedAssignmentId, @replacedEmployeeId,
          @replacementAssignmentId, @replacementEmployeeId, @workTeamId,
          @reason, @resolvedByUserId, @occurredAt
        );

        SELECT CAST(1 AS BIT) AS inserted;
      `);

    const inserted = Boolean(result.recordset?.[0]?.inserted);
    return { inserted };
  },
};
