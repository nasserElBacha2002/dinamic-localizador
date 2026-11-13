import sql from "mssql";
import { randomUUID } from "node:crypto";
import {
  BILLING_SUBSCRIPTION_STATUSES,
  type BillingSubscriptionStatus,
} from "../../constants/billing-subscription";
import { getPool } from "../../database/connection";
import type { BillingSubscription } from "../../types/billing-subscription";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const optionalIso = (value: unknown): string | null => {
  if (value == null) return null;
  return toIso(value as Date | string);
};

const mapRow = (row: Record<string, unknown>): BillingSubscription => ({
  id: String(row.id),
  companyId: String(row.company_id),
  billingPlanId: String(row.billing_plan_id),
  billingPlanTierId:
    row.billing_plan_tier_id == null ? null : String(row.billing_plan_tier_id),
  subscriptionStatus: String(row.subscription_status) as BillingSubscriptionStatus,
  effectiveFrom: toIso(row.effective_from as Date | string),
  effectiveTo: optionalIso(row.effective_to),
  endedAt: optionalIso(row.ended_at),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const assertStatus = (status: string): BillingSubscriptionStatus => {
  if (!BILLING_SUBSCRIPTION_STATUSES.includes(status as BillingSubscriptionStatus)) {
    throw new Error(`Invalid subscription status: ${status}`);
  }
  return status as BillingSubscriptionStatus;
};

const SUBSCRIPTION_OVERLAP_CLAUSE = `
  effective_from < ISNULL(@effectiveTo, '9999-12-31T23:59:59.9999999')
  AND @effectiveFrom < ISNULL(effective_to, '9999-12-31T23:59:59.9999999')
`;

export const billingSubscriptionRepository = {
  async findById(
    subscriptionId: string,
    transaction?: sql.Transaction,
  ): Promise<BillingSubscription | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("subscriptionId", sql.UniqueIdentifier, subscriptionId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_subscriptions
        WHERE id = @subscriptionId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByIdForUpdate(
    subscriptionId: string,
    transaction: sql.Transaction,
  ): Promise<BillingSubscription | null> {
    const result = await new sql.Request(transaction)
      .input("subscriptionId", sql.UniqueIdentifier, subscriptionId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_subscriptions WITH (UPDLOCK, ROWLOCK)
        WHERE id = @subscriptionId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  /**
   * Subscription in vigor at @at: ACTIVE or SCHEDULED within the contractual window (half-open).
   * Prefers ACTIVE when both match.
   */
  async findVigentByCompanyId(companyId: string, at: Date): Promise<BillingSubscription | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_subscriptions
        WHERE company_id = @companyId
          AND subscription_status IN (N'ACTIVE', N'SCHEDULED')
          AND effective_from <= @at
          AND (effective_to IS NULL OR effective_to > @at)
        ORDER BY
          CASE WHEN subscription_status = N'ACTIVE' THEN 0 ELSE 1 END ASC,
          effective_from DESC
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findScheduledFutureByCompanyId(
    companyId: string,
    at: Date,
  ): Promise<BillingSubscription | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_subscriptions
        WHERE company_id = @companyId
          AND subscription_status = N'SCHEDULED'
          AND effective_from > @at
        ORDER BY effective_from ASC
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findEndedBeforeByCompanyId(
    companyId: string,
    at: Date,
  ): Promise<BillingSubscription[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT *
        FROM dbo.billing_subscriptions
        WHERE company_id = @companyId
          AND subscription_status IN (N'ENDED', N'CANCELLED')
          AND effective_to IS NOT NULL
          AND effective_to <= @at
        ORDER BY effective_to DESC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findOverlappingOpenByCompanyInTransaction(
    transaction: sql.Transaction,
    input: {
      companyId: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      excludeSubscriptionId?: string;
    },
  ): Promise<BillingSubscription | null> {
    const request = new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("effectiveFrom", sql.DateTime2, input.effectiveFrom)
      .input("effectiveTo", sql.DateTime2, input.effectiveTo);

    if (input.excludeSubscriptionId) {
      request.input("excludeSubscriptionId", sql.UniqueIdentifier, input.excludeSubscriptionId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM dbo.billing_subscriptions WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND subscription_status IN (N'ACTIVE', N'SCHEDULED')
        ${input.excludeSubscriptionId ? "AND id <> @excludeSubscriptionId" : ""}
        AND ${SUBSCRIPTION_OVERLAP_CLAUSE}
    `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async listByCompanyId(companyId: string): Promise<BillingSubscription[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM dbo.billing_subscriptions
        WHERE company_id = @companyId
        ORDER BY effective_from DESC, created_at DESC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async listOpenByCompanyForUpdate(
    companyId: string,
    transaction: sql.Transaction,
  ): Promise<BillingSubscription[]> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM dbo.billing_subscriptions WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND subscription_status IN (N'ACTIVE', N'SCHEDULED')
        ORDER BY subscription_status ASC, effective_from ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async insertInTransaction(
    transaction: sql.Transaction,
    input: {
      companyId: string;
      billingPlanId: string;
      billingPlanTierId: string | null;
      subscriptionStatus: BillingSubscriptionStatus;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
    },
  ): Promise<BillingSubscription> {
    const subscriptionId = randomUUID();
    const status = assertStatus(input.subscriptionStatus);

    try {
      const result = await new sql.Request(transaction)
        .input("subscriptionId", sql.UniqueIdentifier, subscriptionId)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("billingPlanId", sql.UniqueIdentifier, input.billingPlanId)
        .input("billingPlanTierId", sql.UniqueIdentifier, input.billingPlanTierId)
        .input("subscriptionStatus", sql.NVarChar(20), status)
        .input("effectiveFrom", sql.DateTime2, input.effectiveFrom)
        .input("effectiveTo", sql.DateTime2, input.effectiveTo ?? null)
        .query(`
          DECLARE @inserted TABLE (
            id UNIQUEIDENTIFIER NOT NULL,
            company_id UNIQUEIDENTIFIER NOT NULL,
            billing_plan_id UNIQUEIDENTIFIER NOT NULL,
            billing_plan_tier_id UNIQUEIDENTIFIER NULL,
            subscription_status NVARCHAR(20) NOT NULL,
            effective_from DATETIME2 NOT NULL,
            effective_to DATETIME2 NULL,
            ended_at DATETIME2 NULL,
            created_at DATETIME2 NOT NULL,
            updated_at DATETIME2 NOT NULL
          );

          INSERT INTO dbo.billing_subscriptions (
            id,
            company_id,
            billing_plan_id,
            billing_plan_tier_id,
            subscription_status,
            effective_from,
            effective_to
          )
          OUTPUT
            INSERTED.id,
            INSERTED.company_id,
            INSERTED.billing_plan_id,
            INSERTED.billing_plan_tier_id,
            INSERTED.subscription_status,
            INSERTED.effective_from,
            INSERTED.effective_to,
            INSERTED.ended_at,
            INSERTED.created_at,
            INSERTED.updated_at
          INTO @inserted
          VALUES (
            @subscriptionId,
            @companyId,
            @billingPlanId,
            @billingPlanTierId,
            @subscriptionStatus,
            @effectiveFrom,
            @effectiveTo
          );

          SELECT * FROM @inserted;
        `);
      const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [result.recordset];
      const row = (recordsets[recordsets.length - 1]?.[0] ?? result.recordset[0]) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error("Subscription insert returned no row");
      }
      return mapRow(row);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw error;
      }
      throw error;
    }
  },

  async finalizeInTransaction(
    transaction: sql.Transaction,
    subscriptionId: string,
    input: {
      finalStatus: "ENDED" | "CANCELLED";
      endedAt: Date;
      effectiveTo?: Date | null;
    },
  ): Promise<BillingSubscription> {
    const finalStatus = assertStatus(input.finalStatus);

    const result = await new sql.Request(transaction)
      .input("subscriptionId", sql.UniqueIdentifier, subscriptionId)
      .input("subscriptionStatus", sql.NVarChar(20), finalStatus)
      .input("endedAt", sql.DateTime2, input.endedAt)
      .input("effectiveTo", sql.DateTime2, input.effectiveTo ?? input.endedAt)
      .query(`
        DECLARE @updated TABLE (
          id UNIQUEIDENTIFIER NOT NULL,
          company_id UNIQUEIDENTIFIER NOT NULL,
          billing_plan_id UNIQUEIDENTIFIER NOT NULL,
          billing_plan_tier_id UNIQUEIDENTIFIER NULL,
          subscription_status NVARCHAR(20) NOT NULL,
          effective_from DATETIME2 NOT NULL,
          effective_to DATETIME2 NULL,
          ended_at DATETIME2 NULL,
          created_at DATETIME2 NOT NULL,
          updated_at DATETIME2 NOT NULL
        );

        UPDATE dbo.billing_subscriptions
        SET
          subscription_status = @subscriptionStatus,
          ended_at = @endedAt,
          effective_to = @effectiveTo,
          updated_at = SYSUTCDATETIME()
        OUTPUT
          INSERTED.id,
          INSERTED.company_id,
          INSERTED.billing_plan_id,
          INSERTED.billing_plan_tier_id,
          INSERTED.subscription_status,
          INSERTED.effective_from,
          INSERTED.effective_to,
          INSERTED.ended_at,
          INSERTED.created_at,
          INSERTED.updated_at
        INTO @updated
        WHERE id = @subscriptionId
          AND subscription_status IN (N'ACTIVE', N'SCHEDULED');

        SELECT * FROM @updated;
      `);

    const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [result.recordset];
    const row = (recordsets[recordsets.length - 1]?.[0] ?? result.recordset[0]) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      throw new Error("Subscription not found or already finalized");
    }

    return mapRow(row);
  },
};
