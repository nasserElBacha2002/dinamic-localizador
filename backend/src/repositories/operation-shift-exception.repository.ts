import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  OperationShiftDateException,
  ShiftDateExceptionKind,
} from "../types/operation-shift";
import { toDateOnlyString } from "../utils/row-mappers";
import { parseSqlTimeToHHmm } from "../utils/sql-time";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const optionalTime = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  const parsed = parseSqlTimeToHHmm(value);
  if (!parsed) {
    throw new Error("INVALID_SQL_TIME:exception_time");
  }
  return parsed;
};

export const mapOperationShiftDateExceptionRow = (
  row: Record<string, unknown>,
): OperationShiftDateException => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  operationShiftId: String(row.operation_shift_id),
  workDate: toDateOnlyString(row.work_date as Date | string),
  exceptionKind: String(row.exception_kind) as ShiftDateExceptionKind,
  startTime: optionalTime(row.start_time),
  endTime: optionalTime(row.end_time),
  reason: row.reason != null ? String(row.reason) : null,
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  updatedByUserId: row.updated_by_user_id ? String(row.updated_by_user_id) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export type UpsertOperationShiftDateExceptionInput = {
  operationId: string;
  operationShiftId: string;
  workDate: string;
  exceptionKind: ShiftDateExceptionKind;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
  createdByUserId?: string | null;
};

let updatedByUserIdColumnPresent: boolean | null = null;

const hasUpdatedByUserIdColumn = async (
  requestFactory: () => sql.Request,
): Promise<boolean> => {
  if (updatedByUserIdColumnPresent != null) {
    return updatedByUserIdColumnPresent;
  }
  const result = await requestFactory().query(`
    SELECT CASE
      WHEN COL_LENGTH(N'dbo.operation_shift_date_exceptions', N'updated_by_user_id') IS NULL THEN 0
      ELSE 1
    END AS present
  `);
  updatedByUserIdColumnPresent = Boolean(result.recordset[0]?.present);
  return updatedByUserIdColumnPresent;
};

export const operationShiftExceptionRepository = {
  async findByShiftAndDate(
    companyId: string,
    operationShiftId: string,
    workDate: string,
  ): Promise<OperationShiftDateException | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationShiftId", sql.UniqueIdentifier, operationShiftId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shift_date_exceptions
        WHERE company_id = @companyId
          AND operation_shift_id = @operationShiftId
          AND work_date = @workDate
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftDateExceptionRow(row) : null;
  },

  async findByShiftAndDateInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationShiftId: string,
    workDate: string,
  ): Promise<OperationShiftDateException | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationShiftId", sql.UniqueIdentifier, operationShiftId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shift_date_exceptions WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND operation_shift_id = @operationShiftId
          AND work_date = @workDate
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftDateExceptionRow(row) : null;
  },

  async listByOperationAndDate(
    companyId: string,
    operationId: string,
    workDate: string,
  ): Promise<OperationShiftDateException[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT *
        FROM dbo.operation_shift_date_exceptions
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND work_date = @workDate
        ORDER BY operation_shift_id ASC
      `);
    return result.recordset.map((row) =>
      mapOperationShiftDateExceptionRow(row as Record<string, unknown>),
    );
  },

  async listByOperationAndDateRange(
    companyId: string,
    operationId: string,
    rangeStart: string,
    rangeEnd: string,
  ): Promise<OperationShiftDateException[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("rangeStart", sql.Date, rangeStart)
      .input("rangeEnd", sql.Date, rangeEnd)
      .query(`
        SELECT *
        FROM dbo.operation_shift_date_exceptions
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND work_date >= @rangeStart
          AND work_date <= @rangeEnd
        ORDER BY work_date ASC, operation_shift_id ASC
      `);
    return result.recordset.map((row) =>
      mapOperationShiftDateExceptionRow(row as Record<string, unknown>),
    );
  },

  async findById(companyId: string, id: string): Promise<OperationShiftDateException | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shift_date_exceptions
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftDateExceptionRow(row) : null;
  },

  /**
   * Upsert by unique (operation_id, operation_shift_id, work_date).
   * Select-then-update/insert with UPDLOCK (no MERGE).
   */
  async upsertInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: UpsertOperationShiftDateExceptionInput,
  ): Promise<OperationShiftDateException> {
    const startTime =
      input.exceptionKind === "TIME_OVERRIDE" ? (input.startTime ?? null) : null;
    const endTime = input.exceptionKind === "TIME_OVERRIDE" ? (input.endTime ?? null) : null;
    const actorUserId = input.createdByUserId ?? null;

    const existing = await this.findByShiftAndDateInTransaction(
      companyId,
      transaction,
      input.operationShiftId,
      input.workDate,
    );

    if (existing) {
      const includeUpdatedBy = await hasUpdatedByUserIdColumn(
        () => new sql.Request(transaction),
      );
      const request = new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("id", sql.UniqueIdentifier, existing.id)
        .input("exceptionKind", sql.NVarChar(40), input.exceptionKind)
        .input("startTime", sql.NVarChar(8), startTime)
        .input("endTime", sql.NVarChar(8), endTime)
        .input("reason", sql.NVarChar(500), input.reason ?? null);

      if (includeUpdatedBy) {
        request.input("updatedByUserId", sql.UniqueIdentifier, actorUserId);
      }

      const result = await request.query(`
          UPDATE dbo.operation_shift_date_exceptions
          SET exception_kind = @exceptionKind,
              start_time = CASE
                WHEN @exceptionKind = N'TIME_OVERRIDE' THEN CAST(@startTime AS TIME)
                ELSE NULL
              END,
              end_time = CASE
                WHEN @exceptionKind = N'TIME_OVERRIDE' THEN CAST(@endTime AS TIME)
                ELSE NULL
              END,
              reason = @reason,
              ${includeUpdatedBy ? "updated_by_user_id = @updatedByUserId," : ""}
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE company_id = @companyId AND id = @id
        `);
      return mapOperationShiftDateExceptionRow(result.recordset[0] as Record<string, unknown>);
    }

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("operationShiftId", sql.UniqueIdentifier, input.operationShiftId)
      .input("workDate", sql.Date, input.workDate)
      .input("exceptionKind", sql.NVarChar(40), input.exceptionKind)
      .input("startTime", sql.NVarChar(8), startTime)
      .input("endTime", sql.NVarChar(8), endTime)
      .input("reason", sql.NVarChar(500), input.reason ?? null)
      .input("createdByUserId", sql.UniqueIdentifier, actorUserId)
      .query(`
        INSERT INTO dbo.operation_shift_date_exceptions (
          company_id, operation_id, operation_shift_id, work_date,
          exception_kind, start_time, end_time, reason, created_by_user_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @operationShiftId, @workDate,
          @exceptionKind,
          CASE WHEN @exceptionKind = N'TIME_OVERRIDE' THEN CAST(@startTime AS TIME) ELSE NULL END,
          CASE WHEN @exceptionKind = N'TIME_OVERRIDE' THEN CAST(@endTime AS TIME) ELSE NULL END,
          @reason, @createdByUserId
        )
      `);

    return mapOperationShiftDateExceptionRow(result.recordset[0] as Record<string, unknown>);
  },

  /** Convenience non-TX upsert (opens its own connection). Prefer upsertInTransaction. */
  async upsert(
    companyId: string,
    input: UpsertOperationShiftDateExceptionInput,
  ): Promise<OperationShiftDateException> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const row = await this.upsertInTransaction(companyId, transaction, input);
      await transaction.commit();
      return row;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // already aborted
      }
      throw error;
    }
  },

  async delete(companyId: string, id: string): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        DELETE FROM dbo.operation_shift_date_exceptions
        WHERE company_id = @companyId AND id = @id
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
