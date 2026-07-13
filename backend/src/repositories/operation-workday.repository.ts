import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationWorkdayCancellationReason } from "../constants/workday-cancellation-reason";
import type { OperationWorkday } from "../types/workday";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { toDateOnlyString } from "../utils/row-mappers";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const mapOperationWorkdayRow = (row: Record<string, unknown>): OperationWorkday => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  workDate: toDateOnlyString(row.work_date as Date | string),
  expectedStartAt: toIsoString(row.expected_start_at as Date | string),
  expectedEndAt: row.expected_end_at
    ? toIsoString(row.expected_end_at as Date | string)
    : null,
  earlyToleranceMinutes: Number(row.early_tolerance_minutes),
  lateToleranceMinutes: Number(row.late_tolerance_minutes),
  scheduleVersion: Number(row.schedule_version),
  scheduleSourceSnapshot: row.schedule_source_snapshot
    ? (String(row.schedule_source_snapshot) as OperationWorkday["scheduleSourceSnapshot"])
    : null,
  scheduleTimezoneSnapshot: row.schedule_timezone_snapshot
    ? String(row.schedule_timezone_snapshot)
    : null,
  status: String(row.status) as OperationWorkday["status"],
  cancellationReason: row.cancellation_reason
    ? (String(row.cancellation_reason) as OperationWorkdayCancellationReason)
    : null,
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
      scheduleSourceSnapshot?: OperationWorkday["scheduleSourceSnapshot"];
      scheduleTimezoneSnapshot?: string | null;
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
      .input("scheduleSourceSnapshot", sql.NVarChar(20), input.scheduleSourceSnapshot ?? null)
      .input("scheduleTimezoneSnapshot", sql.NVarChar(80), input.scheduleTimezoneSnapshot ?? null)
      .input("status", sql.NVarChar(20), input.status ?? "ACTIVE")
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version,
          schedule_source_snapshot, schedule_timezone_snapshot, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @workDate, @expectedStartAt, @expectedEndAt,
          @earlyToleranceMinutes, @lateToleranceMinutes, @scheduleVersion,
          @scheduleSourceSnapshot, @scheduleTimezoneSnapshot, @status
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
      scheduleSourceSnapshot?: OperationWorkday["scheduleSourceSnapshot"];
      scheduleTimezoneSnapshot?: string | null;
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
      .input("scheduleSourceSnapshot", sql.NVarChar(20), input.scheduleSourceSnapshot ?? null)
      .input("scheduleTimezoneSnapshot", sql.NVarChar(80), input.scheduleTimezoneSnapshot ?? null)
      .input("status", sql.NVarChar(20), input.status ?? "ACTIVE")
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version,
          schedule_source_snapshot, schedule_timezone_snapshot, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @workDate, @expectedStartAt, @expectedEndAt,
          @earlyToleranceMinutes, @lateToleranceMinutes, @scheduleVersion,
          @scheduleSourceSnapshot, @scheduleTimezoneSnapshot, @status
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

  async listByOperationAndDateRange(
    companyId: string,
    operationId: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<OperationWorkday[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("rangeStart", sql.Date, rangeStart)
      .input("rangeEnd", sql.Date, rangeEnd)
      .query(`
        SELECT *
        FROM operation_workdays
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND work_date >= @rangeStart
          AND work_date <= @rangeEnd
        ORDER BY work_date ASC
      `);

    return result.recordset.map((row) =>
      mapOperationWorkdayRow(row as Record<string, unknown>),
    );
  },

  async hasAttendanceForWorkday(companyId: string, operationWorkdayId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM employee_workdays ew
        INNER JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
         AND ar.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.operation_workday_id = @operationWorkdayId
      `);

    return Boolean(result.recordset[0]);
  },

  async updateSnapshot(
    companyId: string,
    operationWorkdayId: string,
    input: {
      expectedStartAt: Date;
      expectedEndAt: Date | null;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
      scheduleVersion: number;
      scheduleSourceSnapshot: OperationWorkday["scheduleSourceSnapshot"];
      scheduleTimezoneSnapshot: string;
      status: OperationWorkday["status"];
    },
  ): Promise<OperationWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("expectedStartAt", sql.DateTime2, input.expectedStartAt)
      .input("expectedEndAt", sql.DateTime2, input.expectedEndAt)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("scheduleVersion", sql.Int, input.scheduleVersion)
      .input("scheduleSourceSnapshot", sql.NVarChar(20), input.scheduleSourceSnapshot)
      .input("scheduleTimezoneSnapshot", sql.NVarChar(80), input.scheduleTimezoneSnapshot)
      .input("status", sql.NVarChar(20), input.status)
      .query(`
        UPDATE operation_workdays
        SET expected_start_at = @expectedStartAt,
            expected_end_at = @expectedEndAt,
            early_tolerance_minutes = @earlyToleranceMinutes,
            late_tolerance_minutes = @lateToleranceMinutes,
            schedule_version = @scheduleVersion,
            schedule_source_snapshot = @scheduleSourceSnapshot,
            schedule_timezone_snapshot = @scheduleTimezoneSnapshot,
            status = @status,
            cancellation_reason = CASE WHEN @status = 'ACTIVE' THEN NULL ELSE cancellation_reason END,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @operationWorkdayId
          AND schedule_version <= @scheduleVersion
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async reactivateScheduleCancelledWorkday(
    companyId: string,
    operationWorkdayId: string,
    input: {
      expectedStartAt: Date;
      expectedEndAt: Date | null;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
      scheduleVersion: number;
      scheduleSourceSnapshot: OperationWorkday["scheduleSourceSnapshot"];
      scheduleTimezoneSnapshot: string;
    },
  ): Promise<OperationWorkday | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("expectedStartAt", sql.DateTime2, input.expectedStartAt)
      .input("expectedEndAt", sql.DateTime2, input.expectedEndAt)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("scheduleVersion", sql.Int, input.scheduleVersion)
      .input("scheduleSourceSnapshot", sql.NVarChar(20), input.scheduleSourceSnapshot)
      .input("scheduleTimezoneSnapshot", sql.NVarChar(80), input.scheduleTimezoneSnapshot)
      .query(`
        UPDATE operation_workdays
        SET expected_start_at = @expectedStartAt,
            expected_end_at = @expectedEndAt,
            early_tolerance_minutes = @earlyToleranceMinutes,
            late_tolerance_minutes = @lateToleranceMinutes,
            schedule_version = @scheduleVersion,
            schedule_source_snapshot = @scheduleSourceSnapshot,
            schedule_timezone_snapshot = @scheduleTimezoneSnapshot,
            status = 'ACTIVE',
            cancellation_reason = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @operationWorkdayId
          AND status = 'CANCELLED'
          AND cancellation_reason = 'SCHEDULE'
          AND schedule_version <= @scheduleVersion
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async cancelWorkday(
    companyId: string,
    operationWorkdayId: string,
    reason: OperationWorkdayCancellationReason,
  ): Promise<OperationWorkday> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("reason", sql.NVarChar(20), reason)
      .query(`
        UPDATE operation_workdays
        SET status = 'CANCELLED',
            cancellation_reason = @reason,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND id = @operationWorkdayId
          AND status <> 'CANCELLED'
      `);

    if (!result.recordset[0]) {
      const existing = await this.findById(companyId, operationWorkdayId);
      if (!existing) {
        throw new Error("OPERATION_WORKDAY_NOT_FOUND");
      }
      return existing;
    }

    return mapOperationWorkdayRow(result.recordset[0] as Record<string, unknown>);
  },

  async listFutureMutableByOperation(
    companyId: string,
    operationId: string,
    referenceAt: Date,
  ): Promise<OperationWorkday[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("referenceAt", sql.DateTime2, referenceAt)
      .query(`
        SELECT ow.*
        FROM operation_workdays ow
        WHERE ow.company_id = @companyId
          AND ow.operation_id = @operationId
          AND ow.expected_start_at > @referenceAt
          AND ow.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1
            FROM employee_workdays ew
            INNER JOIN attendance_records ar
              ON ar.employee_workday_id = ew.id
             AND ar.company_id = ew.company_id
            WHERE ew.company_id = ow.company_id
              AND ew.operation_workday_id = ow.id
          )
      `);

    return result.recordset.map((row) =>
      mapOperationWorkdayRow(row as Record<string, unknown>),
    );
  },

  async listPaginated(
    companyId: string,
    operationId: string,
    input: {
      page: number;
      limit: number;
      dateFrom?: string;
      dateTo?: string;
      status?: OperationWorkday["status"];
    },
  ): Promise<{ items: OperationWorkday[]; total: number }> {
    const pool = getPool();
    const offset = (input.page - 1) * input.limit;
    const filters: string[] = [
      "company_id = @companyId",
      "operation_id = @operationId",
    ];
    if (input.dateFrom) {
      filters.push("work_date >= @dateFrom");
    }
    if (input.dateTo) {
      filters.push("work_date <= @dateTo");
    }
    if (input.status) {
      filters.push("status = @status");
    }
    const whereClause = filters.join(" AND ");

    const countRequest = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId);
    if (input.dateFrom) {
      countRequest.input("dateFrom", sql.Date, input.dateFrom);
    }
    if (input.dateTo) {
      countRequest.input("dateTo", sql.Date, input.dateTo);
    }
    if (input.status) {
      countRequest.input("status", sql.NVarChar(20), input.status);
    }
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM operation_workdays
      WHERE ${whereClause}
    `);

    const listRequest = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, input.limit);
    if (input.dateFrom) {
      listRequest.input("dateFrom", sql.Date, input.dateFrom);
    }
    if (input.dateTo) {
      listRequest.input("dateTo", sql.Date, input.dateTo);
    }
    if (input.status) {
      listRequest.input("status", sql.NVarChar(20), input.status);
    }
    const listResult = await listRequest.query(`
      SELECT *
      FROM operation_workdays
      WHERE ${whereClause}
      ORDER BY work_date ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      total: Number(countResult.recordset[0]?.total ?? 0),
      items: listResult.recordset.map((row) =>
        mapOperationWorkdayRow(row as Record<string, unknown>),
      ),
    };
  },

  isDuplicateKeyError,
};
