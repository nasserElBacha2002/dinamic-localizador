import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationShift } from "../types/operation-shift";
import { toDateOnlyString } from "../utils/row-mappers";
import { parseSqlTimeToHHmm } from "../utils/sql-time";
import {
  acquireTransactionAppLock,
  operationShiftCodeLockResource,
} from "../utils/sql-app-lock";
import { dateRangesOverlap } from "../utils/shift-time";
import { AppError } from "../errors/app-error";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const requireTime = (value: unknown, field: string): string => {
  const parsed = parseSqlTimeToHHmm(value);
  if (!parsed) {
    throw new Error(`INVALID_SQL_TIME:${field}`);
  }
  return parsed;
};

export const mapOperationShiftRow = (row: Record<string, unknown>): OperationShift => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  templateId: row.template_id ? String(row.template_id) : null,
  code: String(row.code),
  name: String(row.name),
  startTime: requireTime(row.start_time, "start_time"),
  endTime: requireTime(row.end_time, "end_time"),
  effectiveFrom: toDateOnlyString(row.effective_from as Date | string),
  effectiveUntil: row.effective_until
    ? toDateOnlyString(row.effective_until as Date | string)
    : null,
  sortOrder: Number(row.sort_order),
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

type CreateOperationShiftRowInput = {
  operationId: string;
  templateId: string | null;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  sortOrder: number;
  isActive: boolean;
};

export const operationShiftRepository = {
  async listByOperationId(
    companyId: string,
    operationId: string,
    activeOnly = false,
  ): Promise<OperationShift[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId
          AND operation_id = @operationId
          ${activeOnly ? "AND is_active = 1" : ""}
        ORDER BY sort_order ASC, effective_from ASC, code ASC
      `);
    return result.recordset.map((row) => mapOperationShiftRow(row as Record<string, unknown>));
  },

  async findById(companyId: string, id: string): Promise<OperationShift | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },

  async findByIdForOperation(
    companyId: string,
    operationId: string,
    id: string,
  ): Promise<OperationShift | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },

  async listByCode(
    companyId: string,
    operationId: string,
    code: string,
  ): Promise<OperationShift[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("code", sql.NVarChar(80), code)
      .query(`
        SELECT *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND code = @code
        ORDER BY effective_from ASC
      `);
    return result.recordset.map((row) => mapOperationShiftRow(row as Record<string, unknown>));
  },

  /**
   * Insert under SERIALIZABLE + Transaction applock + UPDLOCK/HOLDLOCK on the
   * (company, operation, code) range so two concurrent creates cannot both pass
   * an empty overlap check (key-range / phantom protection + explicit applock).
   */
  async createWithOverlapGuard(
    companyId: string,
    input: CreateOperationShiftRowInput,
  ): Promise<OperationShift> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      await acquireTransactionAppLock(transaction, {
        resource: operationShiftCodeLockResource(companyId, input.operationId, input.code),
        lockTimeoutMs: 15000,
        timeoutError: new AppError(
          409,
          "OPERATION_SHIFT_EFFECTIVE_OVERLAP",
          "Ya existe un turno activo con ese código y vigencia superpuesta.",
        ),
      });

      const existing = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("code", sql.NVarChar(80), input.code)
        .query(`
          SELECT *
          FROM dbo.operation_shifts WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND operation_id = @operationId
            AND code = @code
            AND is_active = 1
        `);

      const overlap = existing.recordset
        .map((row) => mapOperationShiftRow(row as Record<string, unknown>))
        .find((row) =>
          dateRangesOverlap(
            row.effectiveFrom,
            row.effectiveUntil,
            input.effectiveFrom,
            input.effectiveUntil,
          ),
        );

      if (overlap) {
        throw new AppError(
          409,
          "OPERATION_SHIFT_EFFECTIVE_OVERLAP",
          "Ya existe un turno activo con ese código y vigencia superpuesta.",
        );
      }

      const insert = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("templateId", sql.UniqueIdentifier, input.templateId)
        .input("code", sql.NVarChar(80), input.code)
        .input("name", sql.NVarChar(200), input.name)
        .input("startTime", sql.NVarChar(8), input.startTime)
        .input("endTime", sql.NVarChar(8), input.endTime)
        .input("effectiveFrom", sql.Date, input.effectiveFrom)
        .input("effectiveUntil", sql.Date, input.effectiveUntil)
        .input("sortOrder", sql.Int, input.sortOrder)
        .input("isActive", sql.Bit, input.isActive ? 1 : 0)
        .query(`
          INSERT INTO dbo.operation_shifts (
            company_id, operation_id, template_id, code, name,
            start_time, end_time, effective_from, effective_until,
            sort_order, is_active
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @operationId, @templateId, @code, @name,
            CAST(@startTime AS TIME), CAST(@endTime AS TIME),
            @effectiveFrom, @effectiveUntil, @sortOrder, @isActive
          )
        `);

      await transaction.commit();
      return mapOperationShiftRow(insert.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // Transaction may already be aborted (XACT_ABORT).
      }
      throw error;
    }
  },
};
