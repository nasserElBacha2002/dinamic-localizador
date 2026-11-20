import sql from "mssql";
import { getPool } from "../../database/connection";
import {
  META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH,
  META_SERVICE_FREE_TIER_EFFECTIVE_ISO,
} from "../../constants/whatsapp-message-cost";
import {
  acquireTransactionAppLock,
  whatsappServiceMonthLockResource,
} from "../../utils/sql-app-lock";

/**
 * SERVICE month billing strategy (DIN-419):
 *
 * 1. sp_getapplock per sender_billing_key + month — serializes concurrent writers for the same
 *    Meta free-tier scope (one business number × calendar month in BOT_OPERATION_TIMEZONE bounds).
 * 2. Single TRANSACTION: rank assignment (ROW_NUMBER) then set-based repricing for rows with
 *    service_month_rank >= minRankToReprice (incremental — avoids rewriting rows below an append).
 * 3. Late / out-of-order inserts set minRankToReprice to the focus row's new rank so 1001+ rows
 *    are updated when a message is inserted before former rank 1001.
 * 4. Failed delivery rows are marked UNAVAILABLE in the same UPDATE (no positive Meta amount).
 * 5. rank NULL ⇒ UNAVAILABLE (no positive SERVICE tariff without a known quota position).
 */
export const whatsappMessageCostServiceMonthService = {
  async recomputeRanksAndRepriceSenderMonth(input: {
    senderBillingKey: string;
    monthStartUtc: Date;
    nextMonthStartUtc: Date;
    focusId?: string;
    preserveClassification?: boolean;
  }): Promise<number | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    const monthStartIso = input.monthStartUtc.toISOString();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: whatsappServiceMonthLockResource(input.senderBillingKey, monthStartIso),
        lockTimeoutMs: 30_000,
      });

      await new sql.Request(transaction)
        .input("senderBillingKey", sql.NVarChar(64), input.senderBillingKey)
        .input("monthStartUtc", sql.DateTime2, input.monthStartUtc)
        .input("nextMonthStartUtc", sql.DateTime2, input.nextMonthStartUtc)
        .query(`
          UPDATE dbo.whatsapp_message_cost_ledger
          SET service_month_rank = NULL,
              updated_at = SYSUTCDATETIME()
          WHERE sender_billing_key = @senderBillingKey
            AND meta_billing_category = N'SERVICE'
            AND sent_at >= @monthStartUtc
            AND sent_at < @nextMonthStartUtc
            AND (meta_csw_open IS NULL OR meta_csw_open = 0);

          ;WITH eligible AS (
            SELECT id
            FROM dbo.whatsapp_message_cost_ledger WITH (UPDLOCK, HOLDLOCK)
            WHERE sender_billing_key = @senderBillingKey
              AND meta_billing_category = N'SERVICE'
              AND meta_csw_open = 1
              AND sent_at >= @monthStartUtc
              AND sent_at < @nextMonthStartUtc
          ),
          ranked AS (
            SELECT
              e.id,
              ROW_NUMBER() OVER (ORDER BY l.sent_at ASC, l.id ASC) AS service_month_rank
            FROM eligible e
            INNER JOIN dbo.whatsapp_message_cost_ledger l ON l.id = e.id
          )
          UPDATE l
          SET service_month_rank = r.service_month_rank,
              updated_at = SYSUTCDATETIME()
          FROM dbo.whatsapp_message_cost_ledger l
          INNER JOIN ranked r ON r.id = l.id;
        `);

      let minRankToReprice = 1;
      if (input.focusId) {
        const focusRankResult = await new sql.Request(transaction)
          .input("focusId", sql.UniqueIdentifier, input.focusId)
          .query(`
            SELECT service_month_rank
            FROM dbo.whatsapp_message_cost_ledger
            WHERE id = @focusId;
          `);
        const focusRank = Number(focusRankResult.recordset[0]?.service_month_rank ?? 0);
        if (Number.isFinite(focusRank) && focusRank > 0) {
          minRankToReprice = focusRank;
        }
      }

      await new sql.Request(transaction)
        .input("senderBillingKey", sql.NVarChar(64), input.senderBillingKey)
        .input("monthStartUtc", sql.DateTime2, input.monthStartUtc)
        .input("nextMonthStartUtc", sql.DateTime2, input.nextMonthStartUtc)
        .input("minRankToReprice", sql.Int, minRankToReprice)
        .input("freeTierEffective", sql.DateTime2, new Date(META_SERVICE_FREE_TIER_EFFECTIVE_ISO))
        .input("freeTierQuota", sql.Int, META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH)
        .query(`
          UPDATE l
          SET
            meta_price_amount = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN NULL
              WHEN l.service_month_rank IS NULL THEN NULL
              WHEN l.sent_at < @freeTierEffective THEN 0
              WHEN l.service_month_rank <= @freeTierQuota THEN 0
              WHEN t.amount IS NOT NULL THEN t.amount
              ELSE NULL
            END,
            meta_currency = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN NULL
              WHEN l.service_month_rank IS NULL THEN NULL
              WHEN l.sent_at < @freeTierEffective THEN t.currency
              WHEN l.service_month_rank <= @freeTierQuota THEN COALESCE(t.currency, N'USD')
              WHEN t.amount IS NOT NULL THEN t.currency
              ELSE NULL
            END,
            meta_cost_quality = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN N'UNAVAILABLE'
              WHEN l.service_month_rank IS NULL THEN N'UNAVAILABLE'
              WHEN t.amount IS NULL AND l.sent_at >= @freeTierEffective AND l.service_month_rank > @freeTierQuota THEN N'UNAVAILABLE'
              ELSE N'ESTIMATED'
            END,
            meta_cost_source = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN N'NONE'
              WHEN l.service_month_rank IS NULL THEN N'NONE'
              WHEN l.sent_at < @freeTierEffective THEN N'META_POLICY'
              WHEN l.service_month_rank <= @freeTierQuota THEN N'META_POLICY'
              WHEN t.amount IS NOT NULL THEN N'TARIFF_TABLE'
              ELSE N'NONE'
            END,
            meta_tariff_id = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN NULL
              WHEN l.service_month_rank IS NULL THEN NULL
              WHEN l.sent_at < @freeTierEffective THEN NULL
              WHEN l.service_month_rank <= @freeTierQuota THEN t.id
              WHEN t.amount IS NOT NULL THEN t.id
              ELSE NULL
            END,
            meta_cost_note = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN N'DELIVERY_FAILED_META_NOT_VERIFIED'
              WHEN l.service_month_rank IS NULL THEN N'SERVICE_RANK_UNKNOWN'
              WHEN l.sent_at < @freeTierEffective THEN N'PRE_OCT_2026_SERVICE_META_FREE'
              WHEN l.service_month_rank <= @freeTierQuota THEN N'SERVICE_FREE_TIER'
              WHEN t.amount IS NOT NULL THEN N'SERVICE_ABOVE_FREE_TIER'
              ELSE N'NO_META_TARIFF_FOR_SERVICE'
            END,
            meta_billable = CASE
              WHEN LOWER(COALESCE(l.provider_status, N'')) IN (N'failed', N'undelivered') THEN 0
              WHEN l.service_month_rank IS NULL THEN 0
              ELSE 1
            END,
            updated_at = SYSUTCDATETIME()
          FROM dbo.whatsapp_message_cost_ledger l
          OUTER APPLY (
            SELECT TOP (1) t.id, t.amount, t.currency
            FROM dbo.whatsapp_message_cost_tariffs t
            WHERE t.category = N'META_SERVICE'
              AND t.country_or_region = l.destination_country_code
              AND t.effective_from <= l.sent_at
              AND (t.effective_to IS NULL OR t.effective_to > l.sent_at)
            ORDER BY t.effective_from DESC
          ) t
          WHERE l.sender_billing_key = @senderBillingKey
            AND l.meta_billing_category = N'SERVICE'
            AND l.meta_csw_open = 1
            AND l.sent_at >= @monthStartUtc
            AND l.sent_at < @nextMonthStartUtc
            AND l.service_month_rank >= @minRankToReprice;
        `);

      let focusRank: number | null = null;
      if (input.focusId) {
        const focusRow = await new sql.Request(transaction)
          .input("focusId", sql.UniqueIdentifier, input.focusId)
          .query(`SELECT service_month_rank FROM dbo.whatsapp_message_cost_ledger WHERE id = @focusId`);
        const rank = Number(focusRow.recordset[0]?.service_month_rank);
        focusRank = Number.isFinite(rank) ? rank : null;
      }

      await transaction.commit();
      return focusRank;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },
};