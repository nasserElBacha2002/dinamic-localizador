import sql from "mssql";
import { randomUUID } from "node:crypto";
import {
  BILLING_PERIODS,
  BILLING_PRICE_KINDS,
  type BillingPeriod,
  type BillingPriceKind,
} from "../../constants/billing-catalog";
import { getPool } from "../../database/connection";
import type { CommercialBenefitKind } from "../../constants/billing-commercial-benefit";
import type { BillingSubscriptionTerm } from "../../types/billing-subscription";
import { normalizeDecimalString } from "../../utils/money-decimal";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const optionalIso = (value: unknown): string | null => {
  if (value == null) return null;
  return toIso(value as Date | string);
};

const mapRow = (row: Record<string, unknown>): BillingSubscriptionTerm => ({
  id: String(row.id),
  billingSubscriptionId: String(row.billing_subscription_id),
  agreedAmount: normalizeDecimalString(String(row.agreed_amount)) ?? "0",
  currency: String(row.currency),
  billingPeriod: String(row.billing_period) as BillingPeriod,
  priceKind: String(row.price_kind) as BillingPriceKind,
  seatMin: Number(row.seat_min),
  seatMax: row.seat_max == null ? null : Number(row.seat_max),
  billingPlanId: row.billing_plan_id == null ? null : String(row.billing_plan_id),
  billingPlanTierId: row.billing_plan_tier_id == null ? null : String(row.billing_plan_tier_id),
  billingPlanPriceId:
    row.billing_plan_price_id == null ? null : String(row.billing_plan_price_id),
  effectiveFrom: toIso(row.effective_from as Date | string),
  effectiveTo: optionalIso(row.effective_to),
  cancelledAt: optionalIso(row.cancelled_at),
  commercialReference:
    row.commercial_reference == null ? null : String(row.commercial_reference),
  commercialBenefitKind:
    row.commercial_benefit_kind == null
      ? null
      : (String(row.commercial_benefit_kind) as CommercialBenefitKind),
  commercialBenefitBaseAmount:
    row.commercial_benefit_base_amount == null
      ? null
      : normalizeDecimalString(String(row.commercial_benefit_base_amount)),
  commercialBenefitDiscountPercent:
    row.commercial_benefit_discount_percent == null
      ? null
      : normalizeDecimalString(String(row.commercial_benefit_discount_percent)),
  commercialBenefitDiscountAmount:
    row.commercial_benefit_discount_amount == null
      ? null
      : normalizeDecimalString(String(row.commercial_benefit_discount_amount)),
  commercialBenefitReason:
    row.commercial_benefit_reason == null ? null : String(row.commercial_benefit_reason),
  createdByUserId:
    row.created_by_user_id == null ? null : String(row.created_by_user_id),
  adminRequestKey: row.admin_request_key == null ? null : String(row.admin_request_key),
  adminRequestIdempotencyDigest:
    row.admin_request_idempotency_digest == null
      ? null
      : String(row.admin_request_idempotency_digest),
  createdAt: toIso(row.created_at as Date | string),
});

const normalizeCurrency = (currency: string): string => currency.trim().toUpperCase();

const assertBillingPeriod = (billingPeriod: string): BillingPeriod => {
  if (!BILLING_PERIODS.includes(billingPeriod as BillingPeriod)) {
    throw new Error(`Invalid billing period: ${billingPeriod}`);
  }
  return billingPeriod as BillingPeriod;
};

const assertPriceKind = (priceKind: string): BillingPriceKind => {
  if (!BILLING_PRICE_KINDS.includes(priceKind as BillingPriceKind)) {
    throw new Error(`Invalid billing price kind: ${priceKind}`);
  }
  return priceKind as BillingPriceKind;
};

const TERM_OVERLAP_CLAUSE = `
  effective_from < ISNULL(@effectiveTo, '9999-12-31T23:59:59.9999999')
  AND @effectiveFrom < ISNULL(effective_to, '9999-12-31T23:59:59.9999999')
`;

export const billingSubscriptionTermRepository = {
  async listBySubscriptionId(
    billingSubscriptionId: string,
    transaction?: sql.Transaction,
  ): Promise<BillingSubscriptionTerm[]> {
    const request = transaction
      ? new sql.Request(transaction)
      : getPool().request();
    const result = await request
      .input("billingSubscriptionId", sql.UniqueIdentifier, billingSubscriptionId)
      .query(`
        SELECT *
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @billingSubscriptionId
        ORDER BY effective_from DESC, created_at DESC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findActiveAt(
    billingSubscriptionId: string,
    at: Date,
  ): Promise<BillingSubscriptionTerm | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("billingSubscriptionId", sql.UniqueIdentifier, billingSubscriptionId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @billingSubscriptionId
          AND cancelled_at IS NULL
          AND effective_from <= @at
          AND (effective_to IS NULL OR effective_to > @at)
        ORDER BY effective_from DESC
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findOverlappingInTransaction(
    transaction: sql.Transaction,
    input: {
      billingSubscriptionId: string;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      excludeTermId?: string;
    },
  ): Promise<BillingSubscriptionTerm | null> {
    const request = new sql.Request(transaction)
      .input("billingSubscriptionId", sql.UniqueIdentifier, input.billingSubscriptionId)
      .input("effectiveFrom", sql.DateTime2, input.effectiveFrom)
      .input("effectiveTo", sql.DateTime2, input.effectiveTo);

    if (input.excludeTermId) {
      request.input("excludeTermId", sql.UniqueIdentifier, input.excludeTermId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM dbo.billing_subscription_terms WITH (UPDLOCK, HOLDLOCK)
      WHERE billing_subscription_id = @billingSubscriptionId
        AND cancelled_at IS NULL
        ${input.excludeTermId ? "AND id <> @excludeTermId" : ""}
        AND ${TERM_OVERLAP_CLAUSE}
    `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async closeAllTermsAtSubscriptionEndInTransaction(
    transaction: sql.Transaction,
    input: {
      billingSubscriptionId: string;
      subscriptionEffectiveTo: Date;
      cancelledAt: Date;
    },
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("billingSubscriptionId", sql.UniqueIdentifier, input.billingSubscriptionId)
      .input("subscriptionEffectiveTo", sql.DateTime2, input.subscriptionEffectiveTo)
      .input("cancelledAt", sql.DateTime2, input.cancelledAt)
      .query(`
        UPDATE dbo.billing_subscription_terms
        SET cancelled_at = @cancelledAt
        WHERE billing_subscription_id = @billingSubscriptionId
          AND cancelled_at IS NULL
          AND effective_from >= @subscriptionEffectiveTo;

        UPDATE dbo.billing_subscription_terms
        SET effective_to = @subscriptionEffectiveTo
        WHERE billing_subscription_id = @billingSubscriptionId
          AND cancelled_at IS NULL
          AND effective_from < @subscriptionEffectiveTo
          AND (effective_to IS NULL OR effective_to > @subscriptionEffectiveTo);
      `);
  },

  /**
   * Closes prior term versions that extend past @effectiveTo (including bounded rows).
   * Never mutates agreed amounts on historical rows.
   */
  async closeTermsBeforeEffectiveInTransaction(
    transaction: sql.Transaction,
    input: {
      billingSubscriptionId: string;
      effectiveTo: Date;
    },
  ): Promise<number> {
    const result = await new sql.Request(transaction)
      .input("billingSubscriptionId", sql.UniqueIdentifier, input.billingSubscriptionId)
      .input("effectiveTo", sql.DateTime2, input.effectiveTo)
      .query(`
        UPDATE dbo.billing_subscription_terms
        SET effective_to = @effectiveTo
        WHERE billing_subscription_id = @billingSubscriptionId
          AND cancelled_at IS NULL
          AND effective_from < @effectiveTo
          AND (effective_to IS NULL OR effective_to > @effectiveTo)
      `);

    return Number(result.rowsAffected[0] ?? 0);
  },

  async findBySubscriptionAdminRequestKey(
    billingSubscriptionId: string,
    adminRequestKey: string,
    transaction?: sql.Transaction,
  ): Promise<BillingSubscriptionTerm | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("billingSubscriptionId", sql.UniqueIdentifier, billingSubscriptionId)
      .input("adminRequestKey", sql.NVarChar(128), adminRequestKey)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_subscription_terms
        WHERE billing_subscription_id = @billingSubscriptionId
          AND admin_request_key = @adminRequestKey
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async insertVersionInTransaction(
    transaction: sql.Transaction,
    input: {
      billingSubscriptionId: string;
      agreedAmount: string;
      currency: string;
      billingPeriod: BillingPeriod;
      priceKind?: BillingPriceKind;
      seatMin: number;
      seatMax: number | null;
      billingPlanId?: string | null;
      billingPlanTierId?: string | null;
      billingPlanPriceId?: string | null;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
      commercialReference?: string | null;
      createdByUserId?: string | null;
      adminRequestKey?: string | null;
      adminRequestIdempotencyDigest?: string | null;
      commercialBenefitKind?: CommercialBenefitKind | null;
      commercialBenefitBaseAmount?: string | null;
      commercialBenefitDiscountPercent?: string | null;
      commercialBenefitDiscountAmount?: string | null;
      commercialBenefitReason?: string | null;
    },
  ): Promise<BillingSubscriptionTerm> {
    const termId = randomUUID();
    const billingPeriod = assertBillingPeriod(input.billingPeriod);
    const priceKind = assertPriceKind(input.priceKind ?? "REGULAR");
    const normalizedAmount = normalizeDecimalString(input.agreedAmount);
    if (!normalizedAmount) {
      throw new Error("Invalid agreed amount");
    }

    try {
      const result = await new sql.Request(transaction)
        .input("termId", sql.UniqueIdentifier, termId)
        .input("billingSubscriptionId", sql.UniqueIdentifier, input.billingSubscriptionId)
        .input("agreedAmount", sql.Decimal(18, 6), normalizedAmount)
        .input("currency", sql.Char(3), normalizeCurrency(input.currency))
        .input("billingPeriod", sql.NVarChar(10), billingPeriod)
        .input("priceKind", sql.NVarChar(20), priceKind)
        .input("seatMin", sql.Int, input.seatMin)
        .input("seatMax", sql.Int, input.seatMax)
        .input("billingPlanId", sql.UniqueIdentifier, input.billingPlanId ?? null)
        .input("billingPlanTierId", sql.UniqueIdentifier, input.billingPlanTierId ?? null)
        .input("billingPlanPriceId", sql.UniqueIdentifier, input.billingPlanPriceId ?? null)
        .input("effectiveFrom", sql.DateTime2, input.effectiveFrom)
        .input("effectiveTo", sql.DateTime2, input.effectiveTo ?? null)
        .input("commercialReference", sql.NVarChar(500), input.commercialReference ?? null)
        .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId ?? null)
        .input("adminRequestKey", sql.NVarChar(128), input.adminRequestKey ?? null)
        .input(
          "adminRequestIdempotencyDigest",
          sql.Char(64),
          input.adminRequestIdempotencyDigest ?? null,
        )
        .input("commercialBenefitKind", sql.NVarChar(32), input.commercialBenefitKind ?? null)
        .input(
          "commercialBenefitBaseAmount",
          sql.Decimal(18, 6),
          input.commercialBenefitBaseAmount
            ? normalizeDecimalString(input.commercialBenefitBaseAmount)
            : null,
        )
        .input(
          "commercialBenefitDiscountPercent",
          sql.Decimal(9, 4),
          input.commercialBenefitDiscountPercent
            ? normalizeDecimalString(input.commercialBenefitDiscountPercent)
            : null,
        )
        .input(
          "commercialBenefitDiscountAmount",
          sql.Decimal(18, 6),
          input.commercialBenefitDiscountAmount
            ? normalizeDecimalString(input.commercialBenefitDiscountAmount)
            : null,
        )
        .input(
          "commercialBenefitReason",
          sql.NVarChar(500),
          input.commercialBenefitReason ?? null,
        )
        .query(`
          DECLARE @inserted TABLE (
            id UNIQUEIDENTIFIER NOT NULL,
            billing_subscription_id UNIQUEIDENTIFIER NOT NULL,
            agreed_amount DECIMAL(18, 6) NOT NULL,
            currency CHAR(3) NOT NULL,
            billing_period NVARCHAR(10) NOT NULL,
            price_kind NVARCHAR(20) NOT NULL,
            seat_min INT NOT NULL,
            seat_max INT NULL,
            billing_plan_id UNIQUEIDENTIFIER NULL,
            billing_plan_tier_id UNIQUEIDENTIFIER NULL,
            billing_plan_price_id UNIQUEIDENTIFIER NULL,
            effective_from DATETIME2 NOT NULL,
            effective_to DATETIME2 NULL,
            commercial_reference NVARCHAR(500) NULL,
            commercial_benefit_kind NVARCHAR(32) NULL,
            commercial_benefit_base_amount DECIMAL(18, 6) NULL,
            commercial_benefit_discount_percent DECIMAL(9, 4) NULL,
            commercial_benefit_discount_amount DECIMAL(18, 6) NULL,
            commercial_benefit_reason NVARCHAR(500) NULL,
            created_by_user_id UNIQUEIDENTIFIER NULL,
            admin_request_key NVARCHAR(128) NULL,
            admin_request_idempotency_digest CHAR(64) NULL,
            created_at DATETIME2 NOT NULL
          );

          INSERT INTO dbo.billing_subscription_terms (
            id,
            billing_subscription_id,
            agreed_amount,
            currency,
            billing_period,
            price_kind,
            seat_min,
            seat_max,
            billing_plan_id,
            billing_plan_tier_id,
            billing_plan_price_id,
            effective_from,
            effective_to,
            commercial_reference,
            commercial_benefit_kind,
            commercial_benefit_base_amount,
            commercial_benefit_discount_percent,
            commercial_benefit_discount_amount,
            commercial_benefit_reason,
            created_by_user_id,
            admin_request_key,
            admin_request_idempotency_digest
          )
          OUTPUT
            INSERTED.id,
            INSERTED.billing_subscription_id,
            INSERTED.agreed_amount,
            INSERTED.currency,
            INSERTED.billing_period,
            INSERTED.price_kind,
            INSERTED.seat_min,
            INSERTED.seat_max,
            INSERTED.billing_plan_id,
            INSERTED.billing_plan_tier_id,
            INSERTED.billing_plan_price_id,
            INSERTED.effective_from,
            INSERTED.effective_to,
            INSERTED.commercial_reference,
            INSERTED.commercial_benefit_kind,
            INSERTED.commercial_benefit_base_amount,
            INSERTED.commercial_benefit_discount_percent,
            INSERTED.commercial_benefit_discount_amount,
            INSERTED.commercial_benefit_reason,
            INSERTED.created_by_user_id,
            INSERTED.admin_request_key,
            INSERTED.admin_request_idempotency_digest,
            INSERTED.created_at
          INTO @inserted
          VALUES (
            @termId,
            @billingSubscriptionId,
            @agreedAmount,
            @currency,
            @billingPeriod,
            @priceKind,
            @seatMin,
            @seatMax,
            @billingPlanId,
            @billingPlanTierId,
            @billingPlanPriceId,
            @effectiveFrom,
            @effectiveTo,
            @commercialReference,
            @commercialBenefitKind,
            @commercialBenefitBaseAmount,
            @commercialBenefitDiscountPercent,
            @commercialBenefitDiscountAmount,
            @commercialBenefitReason,
            @createdByUserId,
            @adminRequestKey,
            @adminRequestIdempotencyDigest
          );

          SELECT * FROM @inserted;
        `);

      const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [result.recordset];
      const row = (recordsets[recordsets.length - 1]?.[0] ?? result.recordset[0]) as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        throw new Error("Subscription term insert returned no row");
      }
      return mapRow(row);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw error;
      }
      throw error;
    }
  },
};
