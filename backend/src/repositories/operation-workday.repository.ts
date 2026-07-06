import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationWorkday } from "../types/workday";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toDateOnly = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

export const mapOperationWorkdayRow = (row: Record<string, unknown>): OperationWorkday => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  workDate: toDateOnly(row.work_date as Date | string),
  expectedStartAt: toIsoString(row.expected_start_at as Date | string),
  expectedEndAt: row.expected_end_at
    ? toIsoString(row.expected_end_at as Date | string)
    : null,
  earlyToleranceMinutes: Number(row.early_tolerance_minutes),
  lateToleranceMinutes: Number(row.late_tolerance_minutes),
  scheduleVersion: Number(row.schedule_version),
  status: String(row.status) as OperationWorkday["status"],
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const operationWorkdayRepository = {
  async findByOperationAndWorkDate(
    companyId: string,
    operationId: string,
    workDate: string,
  ): Promise<OperationWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT *
        FROM operation_workdays
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND work_date = @workDate
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, id: string): Promise<OperationWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT *
        FROM operation_workdays
        WHERE id = @id AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async insert(
    companyId: string,
    input: {
      operationId: string;
      workDate: string;
      expectedStartAt: Date;
      expectedEndAt: Date | null;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
      scheduleVersion: number;
      status?: OperationWorkday["status"];
    },
  ): Promise<OperationWorkday> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("workDate", sql.Date, input.workDate)
      .input("expectedStartAt", sql.DateTime2, input.expectedStartAt)
      .input("expectedEndAt", sql.DateTime2, input.expectedEndAt)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("scheduleVersion", sql.Int, input.scheduleVersion)
      .input("status", sql.NVarChar(20), input.status ?? "ACTIVE")
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @workDate, @expectedStartAt, @expectedEndAt,
          @earlyToleranceMinutes, @lateToleranceMinutes, @scheduleVersion, @status
        )
      `);

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async insertInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      workDate: string;
      expectedStartAt: Date;
      expectedEndAt: Date | null;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
      scheduleVersion: number;
      status?: OperationWorkday["status"];
    },
  ): Promise<OperationWorkday> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("workDate", sql.Date, input.workDate)
      .input("expectedStartAt", sql.DateTime2, input.expectedStartAt)
      .input("expectedEndAt", sql.DateTime2, input.expectedEndAt)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("scheduleVersion", sql.Int, input.scheduleVersion)
      .input("status", sql.NVarChar(20), input.status ?? "ACTIVE")
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @workDate, @expectedStartAt, @expectedEndAt,
          @earlyToleranceMinutes, @lateToleranceMinutes, @scheduleVersion, @status
        )
      `);

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByOperationAndWorkDateInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
    workDate: string,
  ): Promise<OperationWorkday | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT *
        FROM operation_workdays WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND work_date = @workDate
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByOperationId(companyId: string, operationId: string): Promise<OperationWorkday[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM operation_workdays
        WHERE company_id = @companyId
          AND operation_id = @operationId
        ORDER BY work_date ASC
      `);

    return result.recordset.map((row) =>
      mapOperationWorkdayRow(row as Record<string, unknown>),
    );
  },

  async listByOperationIdInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
  ): Promise<OperationWorkday[]> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM operation_workdays WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND operation_id = @operationId
        ORDER BY work_date ASC
      `);

    return result.recordset.map((row) =>
      mapOperationWorkdayRow(row as Record<string, unknown>),
    );
  },

  isDuplicateKeyError,
};
