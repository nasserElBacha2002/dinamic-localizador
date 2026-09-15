import sql from "mssql";
import { getPool } from "../database/connection";
import {
  DEFAULT_OPERATION_SCHEDULE_MODE,
  isOperationScheduleMode,
  type OperationScheduleMode,
} from "../constants/operation-schedule-mode";
import {
  assertAssignmentShiftMatchesScheduleMode,
  assertWorkdayShiftMatchesScheduleMode,
} from "../utils/operation-schedule-mode-guard";

const resolveScheduleMode = (raw: unknown): OperationScheduleMode => {
  const value = raw == null ? DEFAULT_OPERATION_SCHEDULE_MODE : String(raw);
  if (!isOperationScheduleMode(value)) {
    throw new Error(`INVALID_SCHEDULE_MODE:${value}`);
  }
  return value;
};

export const loadOperationScheduleMode = async (
  companyId: string,
  operationId: string,
  transaction?: sql.Transaction,
): Promise<OperationScheduleMode> => {
  const request = transaction ? new sql.Request(transaction) : getPool().request();
  const result = await request
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("operationId", sql.UniqueIdentifier, operationId)
    .query(`
      SELECT TOP 1 schedule_mode
      FROM dbo.scheduled_operations
      WHERE company_id = @companyId AND id = @operationId
    `);

  const row = result.recordset[0] as { schedule_mode?: unknown } | undefined;
  if (!row) {
    throw new Error(`OPERATION_NOT_FOUND:${operationId}`);
  }
  return resolveScheduleMode(row.schedule_mode);
};

/** Productive workday writes must match schedule_mode / shift pairing. */
export const assertWorkdayWriteAllowed = async (
  companyId: string,
  operationId: string,
  operationShiftId: string | null | undefined,
  transaction?: sql.Transaction,
): Promise<void> => {
  const mode = await loadOperationScheduleMode(companyId, operationId, transaction);
  assertWorkdayShiftMatchesScheduleMode(mode, operationShiftId);
};

/** Productive assignment writes must match schedule_mode / shift pairing. */
export const assertAssignmentWriteAllowed = async (
  companyId: string,
  operationId: string,
  operationShiftId: string | null | undefined,
  transaction?: sql.Transaction,
): Promise<void> => {
  const mode = await loadOperationScheduleMode(companyId, operationId, transaction);
  assertAssignmentShiftMatchesScheduleMode(mode, operationShiftId);
};
