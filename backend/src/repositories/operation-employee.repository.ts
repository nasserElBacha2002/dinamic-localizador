import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { OperationEmployeeAssignment } from "../types/domain";
import { mapAssignmentRow } from "../utils/row-mappers";

const NOT_CANCELLED_CLAUSE = `cancelled_at IS NULL`;

const NOT_CANCELLED_CLAUSE_ALIASED = `oa.cancelled_at IS NULL`;

const ACTIVE_ON_WORK_DATE_CLAUSE = `
  ${NOT_CANCELLED_CLAUSE_ALIASED}
  AND @workDate >= oa.valid_from
  AND (oa.valid_until IS NULL OR @workDate <= oa.valid_until)
`;

const ACTIVE_ON_WORK_DATE_CLAUSE_UNALIASED = `
  ${NOT_CANCELLED_CLAUSE}
  AND @workDate >= valid_from
  AND (valid_until IS NULL OR @workDate <= valid_until)
`;

const OVERLAP_CLAUSE = `
  cancelled_at IS NULL
  AND valid_from <= ISNULL(@validUntil, '9999-12-31')
  AND @validFrom <= ISNULL(valid_until, '9999-12-31')
`;

const listSelectClause = `
  SELECT
    oa.*,
    e.name AS employee_name,
    e.document_number AS employee_document_number,
    e.phone_number AS employee_phone_number,
    e.employee_type AS employee_type,
    e.active AS employee_active,
    e.created_at AS employee_created_at,
    e.updated_at AS employee_updated_at,
    wt.name AS source_work_team_name
  FROM operation_assignments oa
  INNER JOIN employees e ON e.id = oa.employee_id AND e.company_id = @companyId
  LEFT JOIN work_teams wt ON wt.id = oa.source_work_team_id AND wt.company_id = @companyId
`;

export const operationEmployeeRepository = {
  async createInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      employeeId: string;
      validFrom: string;
      validUntil: string | null;
      sourceAssignmentBatchId?: string | null;
      sourceWorkTeamId?: string | null;
      assignmentOrigin?: string;
    },
  ): Promise<OperationEmployeeAssignment> {
    const assignmentId = randomUUID();
    const result = await new sql.Request(transaction)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil)
      .input("sourceAssignmentBatchId", sql.UniqueIdentifier, input.sourceAssignmentBatchId ?? null)
      .input("sourceWorkTeamId", sql.UniqueIdentifier, input.sourceWorkTeamId ?? null)
      .input("assignmentOrigin", sql.NVarChar(20), input.assignmentOrigin ?? "MANUAL")
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          source_assignment_batch_id, source_work_team_id, assignment_origin
        )
        OUTPUT INSERTED.*
        VALUES (
          @assignmentId, @companyId, @operationId, @employeeId, @validFrom, @validUntil,
          @sourceAssignmentBatchId, @sourceWorkTeamId, @assignmentOrigin
        )
      `);

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findOverlappingInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      employeeId: string;
      validFrom: string;
      validUntil: string | null;
      excludeAssignmentId?: string;
    },
  ): Promise<OperationEmployeeAssignment | null> {
    const request = new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil);

    if (input.excludeAssignmentId) {
      request.input("excludeAssignmentId", sql.UniqueIdentifier, input.excludeAssignmentId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM operation_assignments WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND operation_id = @operationId
        AND employee_id = @employeeId
        ${input.excludeAssignmentId ? "AND id <> @excludeAssignmentId" : ""}
        AND ${OVERLAP_CLAUSE}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(
    companyId: string,
    assignmentId: string,
  ): Promise<OperationEmployeeAssignment | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 *
        FROM operation_assignments
        WHERE id = @assignmentId
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByIdInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
  ): Promise<OperationEmployeeAssignment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 *
        FROM operation_assignments WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @assignmentId
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findActiveForEmployeeOnWorkDate(
    companyId: string,
    operationId: string,
    employeeId: string,
    workDate: string,
    transaction?: sql.Transaction,
  ): Promise<OperationEmployeeAssignment | null> {
    const request = transaction
      ? new sql.Request(transaction)
      : getPool().request();

    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT TOP 1 *
        FROM operation_assignments
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND employee_id = @employeeId
          AND ${ACTIVE_ON_WORK_DATE_CLAUSE_UNALIASED}
        ORDER BY valid_from DESC, assigned_at DESC
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async listActiveForOperationOnWorkDate(
    companyId: string,
    operationId: string,
    workDate: string,
  ): Promise<OperationEmployeeAssignment[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        ${listSelectClause}
        WHERE oa.operation_id = @operationId
          AND oa.company_id = @companyId
          AND ${ACTIVE_ON_WORK_DATE_CLAUSE}
        ORDER BY e.name ASC, oa.valid_from ASC
      `);

    return result.recordset.map((row) => mapAssignmentRow(row as Record<string, unknown>));
  },

  async listByOperation(
    companyId: string,
    operationId: string,
  ): Promise<OperationEmployeeAssignment[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        ${listSelectClause}
        WHERE oa.operation_id = @operationId
          AND oa.company_id = @companyId
        ORDER BY oa.valid_from DESC, oa.assigned_at DESC
      `);

    return result.recordset.map((row) => mapAssignmentRow(row as Record<string, unknown>));
  },

  async cancelAssignmentInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
  ): Promise<OperationEmployeeAssignment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        UPDATE operation_assignments
        SET cancelled_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @assignmentId
          AND company_id = @companyId
          AND cancelled_at IS NULL
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateConfirmationStatusByAssignmentId(
    companyId: string,
    assignmentId: string,
    status: AssignmentConfirmationStatus,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("status", sql.NVarChar(20), status)
      .query(`
        UPDATE operation_assignments
        SET confirmation_status = @status,
            confirmed_at = CASE
              WHEN @status = 'CONFIRMED' THEN SYSUTCDATETIME()
              WHEN @status = 'UNAVAILABLE' THEN NULL
              ELSE confirmed_at
            END,
            unavailable_at = CASE
              WHEN @status = 'UNAVAILABLE' THEN SYSUTCDATETIME()
              WHEN @status = 'CONFIRMED' THEN NULL
              ELSE unavailable_at
            END,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @assignmentId
          AND cancelled_at IS NULL
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async endAssignmentInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
    effectiveDate: string,
  ): Promise<OperationEmployeeAssignment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("effectiveDate", sql.Date, effectiveDate)
      .query(`
        UPDATE operation_assignments
        SET valid_until = @effectiveDate,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @assignmentId
          AND company_id = @companyId
          AND cancelled_at IS NULL
          AND valid_until IS NULL
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateValidityInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
    input: { validFrom: string; validUntil: string | null },
  ): Promise<OperationEmployeeAssignment | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil)
      .query(`
        UPDATE operation_assignments
        SET valid_from = @validFrom,
            valid_until = @validUntil,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @assignmentId
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async listOverlappingForOperationInDateRange(
    companyId: string,
    operationId: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<OperationEmployeeAssignment[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("rangeStart", sql.Date, rangeStart)
      .input("rangeEnd", sql.Date, rangeEnd)
      .query(`
        ${listSelectClause}
        WHERE oa.operation_id = @operationId
          AND oa.company_id = @companyId
          AND oa.cancelled_at IS NULL
          AND oa.valid_from <= @rangeEnd
          AND (oa.valid_until IS NULL OR oa.valid_until >= @rangeStart)
        ORDER BY oa.employee_id ASC, oa.valid_from ASC
      `);

    return result.recordset.map((row) => mapAssignmentRow(row as Record<string, unknown>));
  },

  async countActiveForOperationOnWorkDate(
    companyId: string,
    operationId: string,
    workDate: string,
  ): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT COUNT(DISTINCT employee_id) AS total
        FROM operation_assignments
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND ${ACTIVE_ON_WORK_DATE_CLAUSE_UNALIASED}
      `);

    return Number(result.recordset[0]?.total ?? 0);
  },

  async hasAttendanceForAssignment(
    companyId: string,
    assignmentId: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM employee_workdays ew
        INNER JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
         AND ar.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.operation_assignment_id = @assignmentId
      `);

    return Boolean(result.recordset[0]);
  },

  async hasAttendanceRecord(
    companyId: string,
    operationId: string,
    employeeId: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND company_id = @companyId
      `);

    return Boolean(result.recordset[0]);
  },

  async exists(
    companyId: string,
    operationId: string,
    employeeId: string,
    workDate: string,
  ): Promise<boolean> {
    const assignment = await this.findActiveForEmployeeOnWorkDate(
      companyId,
      operationId,
      employeeId,
      workDate,
    );
    return Boolean(assignment);
  },
};
