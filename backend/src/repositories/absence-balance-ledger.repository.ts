import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  AbsenceBalanceMovementDirection,
  AbsenceBalanceMovementType,
} from "../constants/absence-balance-ledger";
import type {
  AbsenceBalanceMovement,
  AbsenceBalanceProjection,
} from "../types/absence-balance-ledger";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapMovement = (row: Record<string, unknown>): AbsenceBalanceMovement => ({
  id: String(row.id),
  companyId: String(row.company_id),
  balanceId: String(row.balance_id),
  employeeId: String(row.employee_id),
  absenceTypeId: String(row.absence_type_id),
  periodYear: Number(row.period_year),
  absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
  movementType: String(row.movement_type) as AbsenceBalanceMovementType,
  quantity: Number(row.quantity),
  direction: String(row.direction) as AbsenceBalanceMovementDirection,
  idempotencyKey: String(row.idempotency_key),
  reason: row.reason ? String(row.reason) : null,
  metadataJson: row.metadata_json ? String(row.metadata_json) : null,
  performedByUserId: row.performed_by_user_id ? String(row.performed_by_user_id) : null,
  performedByEmployeeId: row.performed_by_employee_id
    ? String(row.performed_by_employee_id)
    : null,
  reversedMovementId: row.reversed_movement_id ? String(row.reversed_movement_id) : null,
  createdAt: toIsoString(row.created_at as Date | string),
});

const mapProjection = (row: Record<string, unknown>): AbsenceBalanceProjection => ({
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  absenceTypeId: String(row.absence_type_id),
  year: Number(row.year),
  grantedDays: Number(row.granted_days ?? row.total_days ?? 0),
  reservedDays: Number(row.reserved_days ?? 0),
  consumedDays: Number(row.consumed_days ?? 0),
  availableDays: Number(
    row.available_days ??
      Number(row.granted_days ?? row.total_days ?? 0) -
        Number(row.reserved_days ?? 0) -
        Number(row.consumed_days ?? 0),
  ),
  totalDays: Number(row.total_days ?? row.granted_days ?? 0),
  notes: row.notes ? String(row.notes) : null,
  version: Number(row.version ?? 1),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const absenceBalanceLedgerRepository = {
  async findMovementById(
    companyId: string,
    movementId: string,
    transaction?: sql.Transaction,
  ): Promise<AbsenceBalanceMovement | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("movementId", sql.UniqueIdentifier, movementId)
      .query(`
        SELECT TOP 1 *
        FROM employee_absence_balance_movements
        WHERE company_id = @companyId AND id = @movementId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapMovement(result.recordset[0] as Record<string, unknown>);
  },

  async findMovementByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
    transaction?: sql.Transaction,
  ): Promise<AbsenceBalanceMovement | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("idempotencyKey", sql.NVarChar(200), idempotencyKey)
      .query(`
        SELECT TOP 1 *
        FROM employee_absence_balance_movements
        WHERE company_id = @companyId AND idempotency_key = @idempotencyKey
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapMovement(result.recordset[0] as Record<string, unknown>);
  },

  async insertMovement(
    companyId: string,
    input: {
      balanceId: string;
      employeeId: string;
      absenceTypeId: string;
      periodYear: number;
      absenceRequestId?: string | null;
      movementType: AbsenceBalanceMovementType;
      quantity: number;
      direction: AbsenceBalanceMovementDirection;
      idempotencyKey: string;
      reason?: string | null;
      metadataJson?: string | null;
      performedByUserId?: string | null;
      performedByEmployeeId?: string | null;
      reversedMovementId?: string | null;
    },
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceMovement> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("balanceId", sql.UniqueIdentifier, input.balanceId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
      .input("periodYear", sql.Int, input.periodYear)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId ?? null)
      .input("movementType", sql.NVarChar(40), input.movementType)
      .input("quantity", sql.Decimal(7, 1), input.quantity)
      .input("direction", sql.NVarChar(10), input.direction)
      .input("idempotencyKey", sql.NVarChar(200), input.idempotencyKey)
      .input("reason", sql.NVarChar(500), input.reason ?? null)
      .input("metadataJson", sql.NVarChar(sql.MAX), input.metadataJson ?? null)
      .input("performedByUserId", sql.UniqueIdentifier, input.performedByUserId ?? null)
      .input("performedByEmployeeId", sql.UniqueIdentifier, input.performedByEmployeeId ?? null)
      .input("reversedMovementId", sql.UniqueIdentifier, input.reversedMovementId ?? null)
      .query(`
        INSERT INTO employee_absence_balance_movements (
          company_id, balance_id, employee_id, absence_type_id, period_year,
          absence_request_id, movement_type, quantity, direction, idempotency_key,
          reason, metadata_json, performed_by_user_id, performed_by_employee_id,
          reversed_movement_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @balanceId, @employeeId, @absenceTypeId, @periodYear,
          @absenceRequestId, @movementType, @quantity, @direction, @idempotencyKey,
          @reason, @metadataJson, @performedByUserId, @performedByEmployeeId,
          @reversedMovementId
        )
      `);
    return mapMovement(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Net reservation still held for a request/type/year:
   * RESERVE − RELEASE − CONSUME (consume-from-reserve reduces reserved).
   */
  async getNetReservationForRequest(
    companyId: string,
    absenceRequestId: string,
    absenceTypeId: string,
    year: number,
    transaction: sql.Transaction,
  ): Promise<number> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT
          COALESCE(SUM(CASE WHEN movement_type = N'RESERVE' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN movement_type = N'RELEASE' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN movement_type = N'CONSUME' THEN quantity ELSE 0 END), 0)
          AS net_reserved
        FROM employee_absence_balance_movements WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND absence_type_id = @absenceTypeId
          AND period_year = @year
          AND movement_type IN (N'RESERVE', N'RELEASE', N'CONSUME')
      `);
    return Number(result.recordset[0]?.net_reserved ?? 0);
  },

  async listMovements(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    filters: {
      year?: number;
      movementType?: AbsenceBalanceMovementType;
      page: number;
      limit: number;
    },
  ): Promise<{ data: AbsenceBalanceMovement[]; total: number }> {
    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;
    const countResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, filters.year ?? null)
      .input("movementType", sql.NVarChar(40), filters.movementType ?? null)
      .query(`
        SELECT COUNT(1) AS total
        FROM employee_absence_balance_movements
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND (@year IS NULL OR period_year = @year)
          AND (@movementType IS NULL OR movement_type = @movementType)
      `);
    const dataResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, filters.year ?? null)
      .input("movementType", sql.NVarChar(40), filters.movementType ?? null)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, filters.limit)
      .query(`
        SELECT *
        FROM employee_absence_balance_movements
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND (@year IS NULL OR period_year = @year)
          AND (@movementType IS NULL OR movement_type = @movementType)
        ORDER BY created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    return {
      total: Number(countResult.recordset[0]?.total ?? 0),
      data: dataResult.recordset.map((row) => mapMovement(row as Record<string, unknown>)),
    };
  },

  async lockBalanceForUpdate(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    year: number,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceProjection | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT TOP 1 *
        FROM employee_absence_balances WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND year = @year
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapProjection(result.recordset[0] as Record<string, unknown>);
  },

  async ensureBalanceRow(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    year: number,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceProjection> {
    const existing = await this.lockBalanceForUpdate(
      companyId,
      employeeId,
      absenceTypeId,
      year,
      transaction,
    );
    if (existing) {
      return existing;
    }

    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        INSERT INTO employee_absence_balances (
          company_id, employee_id, absence_type_id, year,
          total_days, granted_days, reserved_days, consumed_days, available_days, notes, version
        )
        VALUES (
          @companyId, @employeeId, @absenceTypeId, @year,
          0, 0, 0, 0, 0, NULL, 1
        )
      `);

    const created = await this.lockBalanceForUpdate(
      companyId,
      employeeId,
      absenceTypeId,
      year,
      transaction,
    );
    if (!created) {
      throw new Error("BALANCE_ENSURE_FAILED");
    }
    return created;
  },

  async applyProjectionDelta(
    companyId: string,
    balanceId: string,
    delta: {
      granted?: number;
      reserved?: number;
      consumed?: number;
      available?: number;
    },
    expectedVersion: number,
    transaction: sql.Transaction,
  ): Promise<AbsenceBalanceProjection | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("balanceId", sql.UniqueIdentifier, balanceId)
      .input("grantedDelta", sql.Decimal(7, 1), delta.granted ?? 0)
      .input("reservedDelta", sql.Decimal(7, 1), delta.reserved ?? 0)
      .input("consumedDelta", sql.Decimal(7, 1), delta.consumed ?? 0)
      .input("availableDelta", sql.Decimal(7, 1), delta.available ?? 0)
      .input("expectedVersion", sql.Int, expectedVersion)
      .query(`
        UPDATE employee_absence_balances
        SET
          granted_days = granted_days + @grantedDelta,
          reserved_days = reserved_days + @reservedDelta,
          consumed_days = consumed_days + @consumedDelta,
          available_days = available_days + @availableDelta,
          total_days = granted_days + @grantedDelta,
          version = version + 1,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @balanceId
          AND company_id = @companyId
          AND version = @expectedVersion
          AND granted_days + @grantedDelta >= 0
          AND reserved_days + @reservedDelta >= 0
          AND consumed_days + @consumedDelta >= 0
          AND available_days + @availableDelta >= 0
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapProjection(result.recordset[0] as Record<string, unknown>);
  },
};
