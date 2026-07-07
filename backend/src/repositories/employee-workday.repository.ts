import sql from "mssql";
import { getPool } from "../database/connection";
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
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = 'CANCELLED',
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
  ): Promise<number> {
    const employeeWorkdays = await this.listByOperationWorkdayId(companyId, operationWorkdayId);
    let cancelled = 0;

    for (const employeeWorkday of employeeWorkdays) {
      if (employeeWorkday.expectationStatus !== "EXPECTED") {
        continue;
      }
      if (await this.hasAttendance(companyId, employeeWorkday.id)) {
        continue;
      }

      const pool = getPool();
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkday.id)
        .query(`
          UPDATE employee_workdays
          SET expectation_status = 'CANCELLED',
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId
            AND id = @employeeWorkdayId
            AND expectation_status = 'EXPECTED'
        `);
      cancelled += 1;
    }

    return cancelled;
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
};
