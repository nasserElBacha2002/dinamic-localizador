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

  async insert(
    companyId: string,
    input: {
      operationWorkdayId: string;
      employeeId: string;
      expectationStatus?: EmployeeWorkday["expectationStatus"];
    },
  ): Promise<EmployeeWorkday> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, input.operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("expectationStatus", sql.NVarChar(20), input.expectationStatus ?? "EXPECTED")
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, expectation_status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @expectationStatus
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
      expectationStatus?: EmployeeWorkday["expectationStatus"];
    },
  ): Promise<EmployeeWorkday> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, input.operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("expectationStatus", sql.NVarChar(20), input.expectationStatus ?? "EXPECTED")
      .query(`
        INSERT INTO employee_workdays (
          company_id, operation_workday_id, employee_id, expectation_status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationWorkdayId, @employeeId, @expectationStatus
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

  isDuplicateKeyError,
};
