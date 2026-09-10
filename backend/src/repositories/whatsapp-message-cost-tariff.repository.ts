import sql from "mssql";
import { getPool } from "../database/connection";
import { normalizeDecimalString } from "../utils/money-decimal";

export interface ActiveTariff {
  id: string;
  amount: string;
  currency: string;
  countryOrRegion: string | null;
  category: string;
}

/**
 * Versioned tariffs for ESTIMATED channel fees only.
 * Applicability key: category + currency + country_or_region + effective window.
 * Without a matching region, callers must leave cost as UNAVAILABLE.
 */
export const whatsappMessageCostTariffRepository = {
  async findActiveTariff(input: {
    category: string;
    currency?: string;
    countryOrRegion: string;
    at: Date;
  }): Promise<ActiveTariff | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("category", sql.NVarChar(40), input.category)
      .input("countryOrRegion", sql.NVarChar(40), input.countryOrRegion)
      .input("at", sql.DateTime2, input.at);

    if (input.currency) {
      request.input("currency", sql.Char(3), input.currency);
    }

    const result = await request.query(`
      SELECT TOP (1) id, amount, currency, country_or_region, category
      FROM dbo.whatsapp_message_cost_tariffs
      WHERE category = @category
        AND country_or_region = @countryOrRegion
        AND effective_from <= @at
        AND (effective_to IS NULL OR effective_to > @at)
        ${input.currency ? "AND currency = @currency" : ""}
      ORDER BY effective_from DESC;
    `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      amount: normalizeDecimalString(String(row.amount)) ?? "0",
      currency: String(row.currency),
      countryOrRegion: row.country_or_region ? String(row.country_or_region) : null,
      category: String(row.category),
    };
  },
};
