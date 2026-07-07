import sql from "mssql";
import { getPool } from "../database/connection";
import type { EmployeeWorkdayCancellationReason } from "../constants/workday-cancellation-reason";
import type { EmployeeWorkday } from "../types/workday";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const mapEmployeeWorkdayRow = (row: Record<string, unknown>): EmployeeWorkday => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationWorkdayId: String(row.operation_workday_id),
  operationAssignmentId: row.operation_assignment_id ? String(row.operation_assignment_id) : null,
  employeeId: String(row.employee_id),
  expectationStatus: String(row.expectation_status) as EmployeeWorkday["expectationStatus"],
  cancellationReason: row.cancellation_reason
    ? (String(row.cancellation_reason) as EmployeeWorkdayCancellationReason)
    : null,
  absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const employeeWorkdayRepository = {
  async findByWorkdayAndEmployee(
    companyId: string,
    operationWorkdayId: string,
    employeeId: string,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT *
        FROM employee_workdays
        WHERE company_id = @companyId
          AND operation_workday_id = @operationWorkdayId
          AND employee_id = @employeeId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByOperationAndEmployee(
    companyId: string,
    operationId: string,
    employeeId: string,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT ew.*
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ow.operation_id = @operationId
          AND ew.employee_id = @employeeId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByOperationAndEmployeeInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
    employeeId: string,
  ): Promise<EmployeeWorkday | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT ew.*
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ow.operation_id = @operationId
          AND ew.employee_id = @employeeId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, id: string): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT *
        FROM employee_workdays
        WHERE id = @id AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByAssignmentInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    assignmentId: string,
  ): Promise<EmployeeWorkday[]> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT *
        FROM employee_workdays
        WHERE company_id = @companyId
          AND operation_assignment_id = @assignmentId
      `);

    return result.recordset.map((row) => mapEmployeeWorkdayRow(row as Record<string, unknown>));
  },

  async hasAttendanceInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    employeeWorkdayId: string,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records
        WHERE company_id = @companyId
          AND employee_workday_id = @employeeWorkdayId
      `);

    return Boolean(result.recordset[0]);
  },

  async cancelExpectationInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    employeeWorkdayId: string,
    reason: EmployeeWorkdayCancellationReason,
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("reason", sql.NVarChar(20), reason)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'CANCELLED',
            cancellation_reason = @reason,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'EXPECTED'
      `);
  },

  async insert(
    companyId: string,
    input: {
      operationWorkdayId: string;
      employeeId: string;
      operationAssignmentId?: string | null;
      expectationStatus?: EmployeeWorkday["expectationStatus"];
    },
  ): Promise<EmployeeWorkday> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, input.operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("operationAssignmentId", sql.UniqueIdentifier, input.operationAssignmentId ?? null)
      .input("expectationStatus", sql.NVarChar(20), input.expectationStatus ?? "EXPECTED")
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id, expectation_status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @operationAssignmentId, @expectationStatus
        )
      `);

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async insertInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationWorkdayId: string;
      employeeId: string;
      operationAssignmentId?: string | null;
      expectationStatus?: EmployeeWorkday["expectationStatus"];
    },
  ): Promise<EmployeeWorkday> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, input.operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("operationAssignmentId", sql.UniqueIdentifier, input.operationAssignmentId ?? null)
      .input("expectationStatus", sql.NVarChar(20), input.expectationStatus ?? "EXPECTED")
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, operation_assignment_id, expectation_status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @operationAssignmentId, @expectationStatus
        )
      `);

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByWorkdayAndEmployeeInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationWorkdayId: string,
    employeeId: string,
  ): Promise<EmployeeWorkday | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT *
        FROM employee_workdays WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND operation_workday_id = @operationWorkdayId
          AND employee_id = @employeeId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async attachAssignment(
    companyId: string,
    employeeWorkdayId: string,
    operationAssignmentId: string,
  ): Promise<EmployeeWorkday> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("operationAssignmentId", sql.UniqueIdentifier, operationAssignmentId)
      .query(`
        UPDATE employee_workdays
        SET operation_assignment_id = @operationAssignmentId,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND operation_assignment_id IS NULL
      `);

    if (!result.recordset[0]) {
      throw new Error("EMPLOYEE_WORKDAY_ASSIGNMENT_ATTACH_FAILED");
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async attachAssignmentInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    employeeWorkdayId: string,
    operationAssignmentId: string,
  ): Promise<EmployeeWorkday> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("operationAssignmentId", sql.UniqueIdentifier, operationAssignmentId)
      .query(`
        UPDATE employee_workdays
        SET operation_assignment_id = @operationAssignmentId,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND operation_assignment_id IS NULL
      `);

    if (!result.recordset[0]) {
      throw new Error("EMPLOYEE_WORKDAY_ASSIGNMENT_ATTACH_FAILED");
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async hasAttendance(
    companyId: string,
    employeeWorkdayId: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records
        WHERE company_id = @companyId
          AND employee_workday_id = @employeeWorkdayId
      `);

    return Boolean(result.recordset[0]);
  },

  async cancelExpectedForWorkday(
    companyId: string,
    operationWorkdayId: string,
    reason: EmployeeWorkdayCancellationReason,
    excludeEmployeeWorkdayIdsWithAttendance: Set<string>,
  ): Promise<number> {
    const employeeWorkdays = await this.listByOperationWorkdayId(companyId, operationWorkdayId);
    let cancelled = 0;

    for (const employeeWorkday of employeeWorkdays) {
      if (employeeWorkday.expectationStatus !== "EXPECTED") {
        continue;
      }
      if (excludeEmployeeWorkdayIdsWithAttendance.has(employeeWorkday.id)) {
        continue;
      }

      const updated = await this.cancelExpectationWithReason(
        companyId,
        employeeWorkday.id,
        reason,
      );
      if (updated) {
        cancelled += 1;
      }
    }

    return cancelled;
  },

  async cancelExpectationWithReason(
    companyId: string,
    employeeWorkdayId: string,
    reason: EmployeeWorkdayCancellationReason,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("reason", sql.NVarChar(20), reason)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'CANCELLED',
            cancellation_reason = @reason,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'EXPECTED'
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async reactivateScheduleCancelledExpectation(
    companyId: string,
    employeeWorkdayId: string,
    operationAssignmentId: string,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("operationAssignmentId", sql.UniqueIdentifier, operationAssignmentId)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'EXPECTED',
            cancellation_reason = NULL,
            operation_assignment_id = @operationAssignmentId,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'CANCELLED'
          AND cancellation_reason = 'SCHEDULE'
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.company_id = @companyId
              AND ar.employee_workday_id = @employeeWorkdayId
          )
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByOperationWorkdayIds(
    companyId: string,
    operationWorkdayIds: string[],
  ): Promise<EmployeeWorkday[]> {
    if (operationWorkdayIds.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const placeholders = operationWorkdayIds.map((id, index) => {
      const param = `workdayId${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT *
      FROM employee_workdays
      WHERE company_id = @companyId
        AND operation_workday_id IN (${placeholders.join(", ")})
    `);

    return result.recordset.map((row) => mapEmployeeWorkdayRow(row as Record<string, unknown>));
  },

  async listAttendancePresenceForEmployeeWorkdayIds(
    companyId: string,
    employeeWorkdayIds: string[],
  ): Promise<Set<string>> {
    if (employeeWorkdayIds.length === 0) {
      return new Set();
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const placeholders = employeeWorkdayIds.map((id, index) => {
      const param = `employeeWorkdayId${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT DISTINCT employee_workday_id
      FROM attendance_records
      WHERE company_id = @companyId
        AND employee_workday_id IN (${placeholders.join(", ")})
    `);

    return new Set(result.recordset.map((row) => String(row.employee_workday_id)));
  },

  async listEmployeeSummariesByOperationWorkdayId(
    companyId: string,
    operationWorkdayId: string,
  ): Promise<
    Array<{
      employeeWorkdayId: string;
      employeeId: string;
      employeeName: string;
      expectationStatus: string;
      cancellationReason: string | null;
      absenceRequestId: string | null;
      absenceTypeName: string | null;
      absenceStartDate: string | null;
      absenceEndDate: string | null;
      hasAttendance: boolean;
    }>
  > {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .query(`
        SELECT ew.id AS employee_workday_id,
               ew.employee_id,
               e.name AS employee_name,
               ew.expectation_status,
               ew.cancellation_reason,
               ew.absence_request_id,
               at.name AS absence_type_name,
               ar_abs.start_date AS absence_start_date,
               ar_abs.end_date AS absence_end_date,
               CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END AS has_attendance
        FROM employee_workdays ew
        INNER JOIN employees e
          ON e.id = ew.employee_id
         AND e.company_id = ew.company_id
        LEFT JOIN absence_requests ar_abs
          ON ar_abs.id = ew.absence_request_id
         AND ar_abs.company_id = ew.company_id
        LEFT JOIN absence_types at
          ON at.id = ar_abs.absence_type_id
         AND at.company_id = ew.company_id
        LEFT JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
         AND ar.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.operation_workday_id = @operationWorkdayId
        ORDER BY e.name ASC
      `);

    return result.recordset.map((row) => ({
      employeeWorkdayId: String(row.employee_workday_id),
      employeeId: String(row.employee_id),
      employeeName: String(row.employee_name),
      expectationStatus: String(row.expectation_status),
      cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
      absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
      absenceTypeName: row.absence_type_name ? String(row.absence_type_name) : null,
      absenceStartDate: row.absence_start_date
        ? String(row.absence_start_date).slice(0, 10)
        : null,
      absenceEndDate: row.absence_end_date ? String(row.absence_end_date).slice(0, 10) : null,
      hasAttendance: Boolean(row.has_attendance),
    }));
  },

  async listByOperationWorkdayId(
    companyId: string,
    operationWorkdayId: string,
  ): Promise<EmployeeWorkday[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .query(`
        SELECT *
        FROM employee_workdays
        WHERE company_id = @companyId
          AND operation_workday_id = @operationWorkdayId
      `);

    return result.recordset.map((row) => mapEmployeeWorkdayRow(row as Record<string, unknown>));
  },

  async countExpectedByWorkdayIds(
    companyId: string,
    operationWorkdayIds: string[],
  ): Promise<Map<string, number>> {
    if (operationWorkdayIds.length === 0) {
      return new Map();
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const placeholders = operationWorkdayIds.map((id, index) => {
      const param = `workdayId${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT operation_workday_id, COUNT(*) AS total
      FROM employee_workdays
      WHERE company_id = @companyId
        AND operation_workday_id IN (${placeholders.join(", ")})
        AND expectation_status <> 'CANCELLED'
      GROUP BY operation_workday_id
    `);

    const counts = new Map<string, number>();
    for (const row of result.recordset) {
      counts.set(String(row.operation_workday_id), Number(row.total));
    }
    return counts;
  },

  isDuplicateKeyError,

  async justifyExpectation(
    companyId: string,
    employeeWorkdayId: string,
    absenceRequestId: string,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'JUSTIFIED',
            absence_request_id = @absenceRequestId,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'EXPECTED'
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async relinkJustifiedExpectation(
    companyId: string,
    employeeWorkdayId: string,
    absenceRequestId: string,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE employee_workdays
        SET absence_request_id = @absenceRequestId,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'JUSTIFIED'
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async restoreJustifiedExpectation(
    companyId: string,
    employeeWorkdayId: string,
    absenceRequestId: string,
  ): Promise<EmployeeWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'EXPECTED',
            absence_request_id = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @employeeWorkdayId
          AND expectation_status = 'JUSTIFIED'
          AND absence_request_id = @absenceRequestId
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.company_id = @companyId
              AND ar.employee_workday_id = @employeeWorkdayId
          )
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async listWithWorkDatesByEmployeeAndDateRange(
    companyId: string,
    employeeId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<
    Array<
      EmployeeWorkday & {
        workDate: string;
        expectedStartAt: string;
        expectedEndAt: string | null;
        earlyToleranceMinutes: number;
        lateToleranceMinutes: number;
      }
    >
  > {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("dateFrom", sql.Date, dateFrom)
      .input("dateTo", sql.Date, dateTo)
      .query(`
        SELECT ew.*,
               ow.work_date,
               ow.expected_start_at,
               ow.expected_end_at,
               ow.early_tolerance_minutes,
               ow.late_tolerance_minutes
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ow.work_date >= @dateFrom
          AND ow.work_date <= @dateTo
      `);

    return result.recordset.map((row) => ({
      ...mapEmployeeWorkdayRow(row as Record<string, unknown>),
      workDate: String(row.work_date).slice(0, 10),
      expectedStartAt: toIsoString(row.expected_start_at as Date | string),
      expectedEndAt: row.expected_end_at
        ? toIsoString(row.expected_end_at as Date | string)
        : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
    }));
  },

  async listWithWorkDatesByAbsenceRequestId(
    companyId: string,
    absenceRequestId: string,
  ): Promise<
    Array<
      EmployeeWorkday & {
        workDate: string;
        expectedStartAt: string;
        expectedEndAt: string | null;
        earlyToleranceMinutes: number;
        lateToleranceMinutes: number;
      }
    >
  > {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        SELECT ew.*,
               ow.work_date,
               ow.expected_start_at,
               ow.expected_end_at,
               ow.early_tolerance_minutes,
               ow.late_tolerance_minutes
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.absence_request_id = @absenceRequestId
      `);

    return result.recordset.map((row) => ({
      ...mapEmployeeWorkdayRow(row as Record<string, unknown>),
      workDate: String(row.work_date).slice(0, 10),
      expectedStartAt: toIsoString(row.expected_start_at as Date | string),
      expectedEndAt: row.expected_end_at
        ? toIsoString(row.expected_end_at as Date | string)
        : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
    }));
  },

  async listWithWorkDatesByEmployeeWorkdayIds(
    companyId: string,
    employeeWorkdayIds: string[],
  ): Promise<
    Array<
      EmployeeWorkday & {
        workDate: string;
        expectedStartAt: string;
        expectedEndAt: string | null;
        earlyToleranceMinutes: number;
        lateToleranceMinutes: number;
      }
    >
  > {
    if (employeeWorkdayIds.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const placeholders = employeeWorkdayIds.map((id, index) => {
      const param = `employeeWorkdayId${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT ew.*,
             ow.work_date,
             ow.expected_start_at,
             ow.expected_end_at,
             ow.early_tolerance_minutes,
             ow.late_tolerance_minutes
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      WHERE ew.company_id = @companyId
        AND ew.id IN (${placeholders.join(", ")})
    `);

    return result.recordset.map((row) => ({
      ...mapEmployeeWorkdayRow(row as Record<string, unknown>),
      workDate: String(row.work_date).slice(0, 10),
      expectedStartAt: toIsoString(row.expected_start_at as Date | string),
      expectedEndAt: row.expected_end_at
        ? toIsoString(row.expected_end_at as Date | string)
        : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
    }));
  },
};
