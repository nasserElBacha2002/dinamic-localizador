import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../../database/connection";
import type { BillingPlanTier } from "../../types/billing-catalog";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): BillingPlanTier => ({
  id: String(row.id),
  billingPlanId: String(row.billing_plan_id),
  tierCode: String(row.tier_code),
  displayName: String(row.display_name),
  seatMin: Number(row.seat_min),
  seatMax: row.seat_max === null || row.seat_max === undefined ? null : Number(row.seat_max),
  sortOrder: Number(row.sort_order),
  isActive: Boolean(row.is_active),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const normalizeTierCode = (tierCode: string): string => tierCode.trim().toUpperCase();

export const billingPlanTierRepository = {
  async listByPlanId(billingPlanId: string): Promise<BillingPlanTier[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("billingPlanId", sql.UniqueIdentifier, billingPlanId)
      .query(`
        SELECT *
        FROM dbo.billing_plan_tiers
        WHERE billing_plan_id = @billingPlanId
        ORDER BY sort_order ASC, seat_min ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findById(tierId: string, transaction?: sql.Transaction): Promise<BillingPlanTier | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("tierId", sql.UniqueIdentifier, tierId).query(`
        SELECT TOP 1 *
        FROM dbo.billing_plan_tiers
        WHERE id = @tierId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  /** Non-authoritative plan lookup to acquire applock before tier row locks. */
  async findBillingPlanIdByTierIdInTransaction(
    tierId: string,
    transaction: sql.Transaction,
  ): Promise<string | null> {
    const result = await new sql.Request(transaction)
      .input("tierId", sql.UniqueIdentifier, tierId)
      .query(`
        SELECT TOP 1 billing_plan_id
        FROM dbo.billing_plan_tiers
        WHERE id = @tierId
      `);
    const row = result.recordset[0] as { billing_plan_id?: string } | undefined;
    return row?.billing_plan_id ? String(row.billing_plan_id) : null;
  },

  async findByIdForUpdate(
    tierId: string,
    transaction: sql.Transaction,
  ): Promise<BillingPlanTier | null> {
    const result = await new sql.Request(transaction)
      .input("tierId", sql.UniqueIdentifier, tierId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_plan_tiers WITH (UPDLOCK, ROWLOCK)
        WHERE id = @tierId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async listActiveByPlanForUpdate(
    billingPlanId: string,
    transaction: sql.Transaction,
    options?: { excludeTierId?: string },
  ): Promise<BillingPlanTier[]> {
    const request = new sql.Request(transaction)
      .input("billingPlanId", sql.UniqueIdentifier, billingPlanId);

    if (options?.excludeTierId) {
      request.input("excludeTierId", sql.UniqueIdentifier, options.excludeTierId);
    }

    const result = await request.query(`
      SELECT *
      FROM dbo.billing_plan_tiers WITH (UPDLOCK, HOLDLOCK)
      WHERE billing_plan_id = @billingPlanId
        AND is_active = 1
        ${options?.excludeTierId ? "AND id <> @excludeTierId" : ""}
      ORDER BY sort_order ASC, seat_min ASC
    `);

    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async insert(
    billingPlanId: string,
    input: {
      tierCode: string;
      displayName: string;
      seatMin: number;
      seatMax: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
    transaction?: sql.Transaction,
  ): Promise<BillingPlanTier> {
    const tierId = randomUUID();
    const request = transaction ? new sql.Request(transaction) : getPool().request();

    try {
      const result = await request
        .input("tierId", sql.UniqueIdentifier, tierId)
        .input("billingPlanId", sql.UniqueIdentifier, billingPlanId)
        .input("tierCode", sql.NVarChar(40), normalizeTierCode(input.tierCode))
        .input("displayName", sql.NVarChar(120), input.displayName.trim())
        .input("seatMin", sql.Int, input.seatMin)
        .input("seatMax", sql.Int, input.seatMax)
        .input("sortOrder", sql.Int, input.sortOrder ?? 0)
        .input("isActive", sql.Bit, input.isActive === false ? 0 : 1)
        .query(`
          INSERT INTO dbo.billing_plan_tiers (
            id, billing_plan_id, tier_code, display_name, seat_min, seat_max, sort_order, is_active
          )
          OUTPUT INSERTED.*
          VALUES (
            @tierId, @billingPlanId, @tierCode, @displayName, @seatMin, @seatMax, @sortOrder, @isActive
          )
        `);
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw error;
      }
      throw error;
    }
  },

  async update(
    tierId: string,
    input: {
      displayName?: string;
      seatMin?: number;
      seatMax?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
    transaction?: sql.Transaction,
  ): Promise<BillingPlanTier> {
    const existing = transaction
      ? await this.findByIdForUpdate(tierId, transaction)
      : await this.findById(tierId);
    if (!existing) {
      throw new Error("Billing plan tier not found");
    }

    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("tierId", sql.UniqueIdentifier, tierId)
      .input("displayName", sql.NVarChar(120), input.displayName?.trim() ?? existing.displayName)
      .input("seatMin", sql.Int, input.seatMin ?? existing.seatMin)
      .input(
        "seatMax",
        sql.Int,
        input.seatMax === undefined ? existing.seatMax : input.seatMax,
      )
      .input("sortOrder", sql.Int, input.sortOrder ?? existing.sortOrder)
      .input(
        "isActive",
        sql.Bit,
        input.isActive === undefined ? (existing.isActive ? 1 : 0) : input.isActive ? 1 : 0,
      )
      .query(`
        UPDATE dbo.billing_plan_tiers
        SET
          display_name = @displayName,
          seat_min = @seatMin,
          seat_max = @seatMax,
          sort_order = @sortOrder,
          is_active = @isActive,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @tierId
      `);

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },
};
