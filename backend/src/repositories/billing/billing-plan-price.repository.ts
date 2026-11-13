import sql from "mssql";
import { randomUUID } from "node:crypto";
import {
  BILLING_PERIODS,
  BILLING_PRICE_KINDS,
  type BillingPeriod,
  type BillingPriceKind,
} from "../../constants/billing-catalog";
import { getPool } from "../../database/connection";
import type { BillingPlanPrice } from "../../types/billing-catalog";
import { normalizeDecimalString } from "../../utils/money-decimal";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): BillingPlanPrice => ({
  id: String(row.id),
  billingPlanTierId: String(row.billing_plan_tier_id),
  amount: normalizeDecimalString(String(row.amount)) ?? "0",
  currency: String(row.currency),
  billingPeriod: String(row.billing_period) as BillingPeriod,
  priceKind: String(row.price_kind) as BillingPriceKind,
  effectiveFrom: toIso(row.effective_from as Date | string),
  effectiveTo: row.effective_to ? toIso(row.effective_to as Date | string) : null,
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

const PRICE_OVERLAP_CLAUSE = `
  effective_from < ISNULL(@effectiveTo, '9999-12-31T23:59:59.9999999')
  AND @effectiveFrom < ISNULL(effective_to, '9999-12-31T23:59:59.9999999')
`;

export const billingPlanPriceRepository = {
  async listByTierId(billingPlanTierId: string): Promise<BillingPlanPrice[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("billingPlanTierId", sql.UniqueIdentifier, billingPlanTierId)
      .query(`
        SELECT *
        FROM dbo.billing_plan_prices
        WHERE billing_plan_tier_id = @billingPlanTierId
        ORDER BY effective_from DESC, created_at DESC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findActiveAt(input: {
    billingPlanTierId: string;
    currency: string;
    billingPeriod: BillingPeriod;
    at: Date;
  }): Promise<BillingPlanPrice | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("billingPlanTierId", sql.UniqueIdentifier, input.billingPlanTierId)
      .input("currency", sql.Char(3), normalizeCurrency(input.currency))
      .input("billingPeriod", sql.NVarChar(10), input.billingPeriod)
      .input("at", sql.DateTime2, input.at)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_plan_prices
        WHERE billing_plan_tier_id = @billingPlanTierId
          AND currency = @currency
          AND billing_period = @billingPeriod
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
      billingPlanTierId: string;
      currency: string;
      billingPeriod: BillingPeriod;
      effectiveFrom: Date;
      effectiveTo: Date | null;
      excludePriceId?: string;
    },
  ): Promise<BillingPlanPrice | null> {
    const request = new sql.Request(transaction)
      .input("billingPlanTierId", sql.UniqueIdentifier, input.billingPlanTierId)
      .input("currency", sql.Char(3), normalizeCurrency(input.currency))
      .input("billingPeriod", sql.NVarChar(10), input.billingPeriod)
      .input("effectiveFrom", sql.DateTime2, input.effectiveFrom)
      .input("effectiveTo", sql.DateTime2, input.effectiveTo);

    if (input.excludePriceId) {
      request.input("excludePriceId", sql.UniqueIdentifier, input.excludePriceId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM dbo.billing_plan_prices WITH (UPDLOCK, HOLDLOCK)
      WHERE billing_plan_tier_id = @billingPlanTierId
        AND currency = @currency
        AND billing_period = @billingPeriod
        ${input.excludePriceId ? "AND id <> @excludePriceId" : ""}
        AND ${PRICE_OVERLAP_CLAUSE}
    `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async closeOpenPricesBeforeInTransaction(
    transaction: sql.Transaction,
    input: {
      billingPlanTierId: string;
      currency: string;
      billingPeriod: BillingPeriod;
      effectiveTo: Date;
    },
  ): Promise<number> {
    const result = await new sql.Request(transaction)
      .input("billingPlanTierId", sql.UniqueIdentifier, input.billingPlanTierId)
      .input("currency", sql.Char(3), normalizeCurrency(input.currency))
      .input("billingPeriod", sql.NVarChar(10), input.billingPeriod)
      .input("effectiveTo", sql.DateTime2, input.effectiveTo)
      .query(`
        UPDATE dbo.billing_plan_prices
        SET effective_to = @effectiveTo
        WHERE billing_plan_tier_id = @billingPlanTierId
          AND currency = @currency
          AND billing_period = @billingPeriod
          AND effective_to IS NULL
          AND effective_from < @effectiveTo
      `);

    return Number(result.rowsAffected[0] ?? 0);
  },

  async insertVersionInTransaction(
    transaction: sql.Transaction,
    input: {
      billingPlanTierId: string;
      amount: string;
      currency: string;
      billingPeriod: BillingPeriod;
      priceKind?: BillingPriceKind;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    },
  ): Promise<BillingPlanPrice> {
    const priceId = randomUUID();
    const billingPeriod = assertBillingPeriod(input.billingPeriod);
    const priceKind = assertPriceKind(input.priceKind ?? "REGULAR");
    const normalizedAmount = normalizeDecimalString(input.amount);
    if (!normalizedAmount) {
      throw new Error("Invalid amount");
    }

    try {
      const result = await new sql.Request(transaction)
        .input("priceId", sql.UniqueIdentifier, priceId)
        .input("billingPlanTierId", sql.UniqueIdentifier, input.billingPlanTierId)
        .input("amount", sql.Decimal(18, 6), normalizedAmount)
        .input("currency", sql.Char(3), normalizeCurrency(input.currency))
        .input("billingPeriod", sql.NVarChar(10), billingPeriod)
        .input("priceKind", sql.NVarChar(20), priceKind)
        .input("effectiveFrom", sql.DateTime2, input.effectiveFrom)
        .input("effectiveTo", sql.DateTime2, input.effectiveTo)
        .query(`
          INSERT INTO dbo.billing_plan_prices (
            id,
            billing_plan_tier_id,
            amount,
            currency,
            billing_period,
            price_kind,
            effective_from,
            effective_to
          )
          OUTPUT INSERTED.*
          VALUES (
            @priceId,
            @billingPlanTierId,
            @amount,
            @currency,
            @billingPeriod,
            @priceKind,
            @effectiveFrom,
            @effectiveTo
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
};
