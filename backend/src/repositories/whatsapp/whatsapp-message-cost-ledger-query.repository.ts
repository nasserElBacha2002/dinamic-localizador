import sql from "mssql";
import { getPool } from "../../database/connection";
import { normalizeDecimalString } from "../../utils/money-decimal";
import {
  mapLedgerRow,
  toDate,
  type CompanyBreakdownRow,
  type CostLedgerFilters,
  type CostSyncHeartbeat,
  type CurrencyTotalRow,
  type TemplateBreakdownRow,
  type WhatsappMessageCostLedgerRow,
} from "./whatsapp-message-cost-ledger.types";

/** Keep last_run_at fresh within WORKER_STALE_MS (15m) without writing every tick. */
export const COST_SYNC_HEARTBEAT_TOUCH_MINUTES = 5;

const applyFilters = (request: sql.Request, filters: CostLedgerFilters, alias = "l"): string => {
  const clauses: string[] = [
    `${alias}.sent_at >= @monthStartUtc`,
    `${alias}.sent_at < @nextMonthStartUtc`,
  ];
  if (filters.direction) {
    request.input("direction", sql.NVarChar(10), filters.direction);
    clauses.push(`${alias}.direction = @direction`);
  }
  request.input("monthStartUtc", sql.DateTime2, filters.monthStartUtc);
  request.input("nextMonthStartUtc", sql.DateTime2, filters.nextMonthStartUtc);

  if (filters.companyId) {
    request.input("companyId", sql.UniqueIdentifier, filters.companyId);
    clauses.push(`${alias}.company_id = @companyId`);
  }
  if (filters.messageKind) {
    request.input("messageKind", sql.NVarChar(40), filters.messageKind);
    clauses.push(`${alias}.message_kind = @messageKind`);
  }
  if (filters.templateSid) {
    request.input("templateSid", sql.NVarChar(100), filters.templateSid);
    clauses.push(`${alias}.template_sid = @templateSid`);
  }
  if (filters.providerStatus) {
    request.input("providerStatus", sql.NVarChar(40), filters.providerStatus);
    clauses.push(`${alias}.provider_status = @providerStatus`);
  }
  if (filters.costQuality) {
    request.input("costQuality", sql.NVarChar(20), filters.costQuality);
    clauses.push(`${alias}.cost_quality = @costQuality`);
  }
  return clauses.join("\n      AND ");
};

export const whatsappMessageCostLedgerQueryRepository = {
  async summarizeTwilioByCurrency(filters: CostLedgerFilters): Promise<CurrencyTotalRow[]> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT
        COALESCE(currency, N'UNK') AS currency,
        COUNT(*) AS message_count,
        SUM(CASE WHEN cost_quality = N'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_count,
        SUM(CASE WHEN cost_quality = N'ESTIMATED' THEN 1 ELSE 0 END) AS estimated_count,
        SUM(CASE WHEN cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_count,
        SUM(CASE
              WHEN cost_quality = N'PENDING' AND currency IS NULL THEN 1
              ELSE 0
            END) AS pending_without_currency_count,
        COALESCE(SUM(CASE WHEN cost_quality = N'CONFIRMED' THEN ABS(price_amount) ELSE 0 END), 0) AS twilio_confirmed_total,
        COALESCE(SUM(CASE WHEN cost_quality = N'ESTIMATED' THEN ABS(price_amount) ELSE 0 END), 0) AS twilio_estimated_total
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where}
      GROUP BY COALESCE(currency, N'UNK')
      ORDER BY currency ASC;
    `);
    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      currency: String(row.currency),
      confirmedTotal: normalizeDecimalString(String(row.twilio_confirmed_total)) ?? "0",
      estimatedTotal: normalizeDecimalString(String(row.twilio_estimated_total)) ?? "0",
      twilioConfirmedTotal: normalizeDecimalString(String(row.twilio_confirmed_total)) ?? "0",
      twilioEstimatedTotal: normalizeDecimalString(String(row.twilio_estimated_total)) ?? "0",
      metaConfirmedTotal: "0",
      metaEstimatedTotal: "0",
      combinedConfirmedTotal: normalizeDecimalString(String(row.twilio_confirmed_total)) ?? "0",
      combinedEstimatedTotal: normalizeDecimalString(String(row.twilio_estimated_total)) ?? "0",
      inboundCount: 0,
      outboundCount: 0,
      serviceFreeTierUsedCount: 0,
      messageCount: Number(row.message_count ?? 0),
      confirmedCount: Number(row.confirmed_count ?? 0),
      estimatedCount: Number(row.estimated_count ?? 0),
      pendingCount: Number(row.pending_count ?? 0),
      unavailableCount: Number(row.unavailable_count ?? 0),
      pendingWithoutCurrencyCount: Number(row.pending_without_currency_count ?? 0),
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
    }));
  },

  async summarizeMetaByCurrency(filters: CostLedgerFilters): Promise<CurrencyTotalRow[]> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT
        COALESCE(meta_currency, N'UNK_META') AS currency,
        COUNT(*) AS message_count,
        SUM(CASE WHEN meta_cost_quality = N'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_count,
        SUM(CASE WHEN meta_cost_quality = N'ESTIMATED' THEN 1 ELSE 0 END) AS estimated_count,
        SUM(CASE WHEN meta_cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN meta_cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_count,
        COALESCE(SUM(CASE WHEN meta_cost_quality = N'CONFIRMED' THEN ABS(meta_price_amount) ELSE 0 END), 0) AS meta_confirmed_total,
        COALESCE(SUM(CASE WHEN meta_cost_quality = N'ESTIMATED' THEN ABS(meta_price_amount) ELSE 0 END), 0) AS meta_estimated_total,
        COALESCE(SUM(CASE
              WHEN meta_billing_category = N'SERVICE'
               AND meta_cost_note = N'SERVICE_FREE_TIER' THEN 1
              ELSE 0
            END), 0) AS service_free_tier_used_count
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where}
      GROUP BY COALESCE(meta_currency, N'UNK_META')
      ORDER BY currency ASC;
    `);
    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      currency: String(row.currency),
      confirmedTotal: normalizeDecimalString(String(row.meta_confirmed_total)) ?? "0",
      estimatedTotal: normalizeDecimalString(String(row.meta_estimated_total)) ?? "0",
      twilioConfirmedTotal: "0",
      twilioEstimatedTotal: "0",
      metaConfirmedTotal: normalizeDecimalString(String(row.meta_confirmed_total)) ?? "0",
      metaEstimatedTotal: normalizeDecimalString(String(row.meta_estimated_total)) ?? "0",
      combinedConfirmedTotal: normalizeDecimalString(String(row.meta_confirmed_total)) ?? "0",
      combinedEstimatedTotal: normalizeDecimalString(String(row.meta_estimated_total)) ?? "0",
      inboundCount: 0,
      outboundCount: 0,
      serviceFreeTierUsedCount: Number(row.service_free_tier_used_count ?? 0),
      messageCount: Number(row.message_count ?? 0),
      confirmedCount: Number(row.confirmed_count ?? 0),
      estimatedCount: Number(row.estimated_count ?? 0),
      pendingCount: Number(row.pending_count ?? 0),
      unavailableCount: Number(row.unavailable_count ?? 0),
      pendingWithoutCurrencyCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
    }));
  },

  async summarizeAggregateCounts(filters: CostLedgerFilters): Promise<{
    messageCount: number;
    pendingCount: number;
    unavailableCount: number;
    metaPendingCount: number;
    metaUnavailableCount: number;
    twilioPendingCount: number;
    inboundCount: number;
    outboundCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    failedCount: number;
  }> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT
        COUNT(*) AS message_count,
        SUM(CASE WHEN cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS twilio_pending_count,
        SUM(CASE WHEN cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS twilio_unavailable_count,
        SUM(CASE WHEN meta_cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS meta_pending_count,
        SUM(CASE WHEN meta_cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS meta_unavailable_count,
        SUM(CASE WHEN direction = N'INBOUND' THEN 1 ELSE 0 END) AS inbound_count,
        SUM(CASE WHEN direction = N'OUTBOUND' THEN 1 ELSE 0 END) AS outbound_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) IN (N'sent', N'send_accepted', N'accepted') THEN 1 ELSE 0 END) AS sent_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) = N'delivered' THEN 1 ELSE 0 END) AS delivered_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) = N'read' THEN 1 ELSE 0 END) AS read_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) IN (N'failed', N'undelivered') THEN 1 ELSE 0 END) AS failed_count
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where};
    `);
    const row = result.recordset[0] as Record<string, unknown>;
    const twilioPending = Number(row.twilio_pending_count ?? 0);
    const metaPending = Number(row.meta_pending_count ?? 0);
    const twilioUnavailable = Number(row.twilio_unavailable_count ?? 0);
    const metaUnavailable = Number(row.meta_unavailable_count ?? 0);
    return {
      messageCount: Number(row.message_count ?? 0),
      pendingCount: twilioPending + metaPending,
      unavailableCount: twilioUnavailable + metaUnavailable,
      metaPendingCount: metaPending,
      metaUnavailableCount: metaUnavailable,
      twilioPendingCount: twilioPending,
      inboundCount: Number(row.inbound_count ?? 0),
      outboundCount: Number(row.outbound_count ?? 0),
      sentCount: Number(row.sent_count ?? 0),
      deliveredCount: Number(row.delivered_count ?? 0),
      readCount: Number(row.read_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
    };
  },

  /** @deprecated Prefer summarizeTwilioByCurrency + summarizeMetaByCurrency */
  async summarizeByCurrency(filters: CostLedgerFilters): Promise<CurrencyTotalRow[]> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT
        COALESCE(currency, N'UNK') AS currency,
        COUNT(*) AS message_count,
        SUM(CASE WHEN cost_quality = N'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_count,
        SUM(CASE WHEN cost_quality = N'ESTIMATED' THEN 1 ELSE 0 END) AS estimated_count,
        SUM(CASE WHEN cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_count,
        SUM(CASE
              WHEN cost_quality = N'PENDING' AND currency IS NULL THEN 1
              ELSE 0
            END) AS pending_without_currency_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) IN (N'sent', N'send_accepted', N'accepted') THEN 1 ELSE 0 END) AS sent_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) = N'delivered' THEN 1 ELSE 0 END) AS delivered_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) = N'read' THEN 1 ELSE 0 END) AS read_count,
        SUM(CASE WHEN LOWER(COALESCE(provider_status, N'')) IN (N'failed', N'undelivered') THEN 1 ELSE 0 END) AS failed_count,
        COALESCE(SUM(CASE WHEN cost_quality = N'CONFIRMED' THEN ABS(price_amount) ELSE 0 END), 0) AS twilio_confirmed_total,
        COALESCE(SUM(CASE WHEN cost_quality = N'ESTIMATED' THEN ABS(price_amount) ELSE 0 END), 0) AS twilio_estimated_total,
        COALESCE(SUM(CASE WHEN meta_cost_quality = N'CONFIRMED' THEN ABS(meta_price_amount) ELSE 0 END), 0) AS meta_confirmed_total,
        COALESCE(SUM(CASE WHEN meta_cost_quality = N'ESTIMATED' THEN ABS(meta_price_amount) ELSE 0 END), 0) AS meta_estimated_total,
        COALESCE(SUM(CASE WHEN direction = N'INBOUND' THEN 1 ELSE 0 END), 0) AS inbound_count,
        COALESCE(SUM(CASE WHEN direction = N'OUTBOUND' THEN 1 ELSE 0 END), 0) AS outbound_count,
        COALESCE(SUM(CASE
              WHEN meta_billing_category = N'SERVICE'
               AND meta_cost_note = N'SERVICE_FREE_TIER' THEN 1
              ELSE 0
            END), 0) AS service_free_tier_used_count,
        COALESCE(SUM(CASE WHEN cost_quality = N'CONFIRMED' THEN ABS(price_amount) ELSE 0 END), 0) AS confirmed_total,
        COALESCE(SUM(CASE WHEN cost_quality = N'ESTIMATED' THEN ABS(price_amount) ELSE 0 END), 0) AS estimated_total,
        COALESCE(SUM(CASE WHEN cost_quality = N'CONFIRMED' THEN ABS(price_amount) ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN meta_cost_quality = N'CONFIRMED' THEN ABS(meta_price_amount) ELSE 0 END), 0) AS combined_confirmed_total,
        COALESCE(SUM(CASE WHEN cost_quality = N'ESTIMATED' THEN ABS(price_amount) ELSE 0 END), 0)
          + COALESCE(SUM(CASE WHEN meta_cost_quality = N'ESTIMATED' THEN ABS(meta_price_amount) ELSE 0 END), 0) AS combined_estimated_total
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where}
      GROUP BY COALESCE(currency, N'UNK')
      ORDER BY currency ASC;
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => {
      return {
      currency: String(row.currency),
      confirmedTotal: normalizeDecimalString(String(row.confirmed_total)) ?? "0",
      estimatedTotal: normalizeDecimalString(String(row.estimated_total)) ?? "0",
      twilioConfirmedTotal: normalizeDecimalString(String(row.twilio_confirmed_total)) ?? "0",
      twilioEstimatedTotal: normalizeDecimalString(String(row.twilio_estimated_total)) ?? "0",
      metaConfirmedTotal: normalizeDecimalString(String(row.meta_confirmed_total)) ?? "0",
      metaEstimatedTotal: normalizeDecimalString(String(row.meta_estimated_total)) ?? "0",
      combinedConfirmedTotal:
        normalizeDecimalString(String(row.combined_confirmed_total)) ?? "0",
      combinedEstimatedTotal:
        normalizeDecimalString(String(row.combined_estimated_total)) ?? "0",
      inboundCount: Number(row.inbound_count ?? 0),
      outboundCount: Number(row.outbound_count ?? 0),
      serviceFreeTierUsedCount: Number(row.service_free_tier_used_count ?? 0),
      messageCount: Number(row.message_count ?? 0),
      confirmedCount: Number(row.confirmed_count ?? 0),
      estimatedCount: Number(row.estimated_count ?? 0),
      pendingCount: Number(row.pending_count ?? 0),
      unavailableCount: Number(row.unavailable_count ?? 0),
      pendingWithoutCurrencyCount: Number(row.pending_without_currency_count ?? 0),
      sentCount: Number(row.sent_count ?? 0),
      deliveredCount: Number(row.delivered_count ?? 0),
      readCount: Number(row.read_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
    };
    });
  },

  async breakdownByCompany(filters: CostLedgerFilters): Promise<CompanyBreakdownRow[]> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT
        l.company_id,
        COALESCE(c.name, l.company_name_snapshot) AS company_name,
        COALESCE(l.currency, N'UNK') AS currency,
        COUNT(*) AS message_count,
        SUM(CASE WHEN l.cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN l.cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_count,
        COALESCE(SUM(CASE WHEN l.cost_quality = N'CONFIRMED' THEN ABS(l.price_amount) ELSE 0 END), 0) AS confirmed_total,
        COALESCE(SUM(CASE WHEN l.cost_quality = N'ESTIMATED' THEN ABS(l.price_amount) ELSE 0 END), 0) AS estimated_total
      FROM dbo.whatsapp_message_cost_ledger l
      LEFT JOIN dbo.companies c ON c.id = l.company_id
      WHERE ${where}
      GROUP BY l.company_id, COALESCE(c.name, l.company_name_snapshot), COALESCE(l.currency, N'UNK')
      ORDER BY company_name ASC, currency ASC;
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      companyId: row.company_id ? String(row.company_id) : null,
      companyName: row.company_name ? String(row.company_name) : null,
      currency: row.currency ? String(row.currency) : null,
      confirmedTotal: normalizeDecimalString(String(row.confirmed_total)) ?? "0",
      estimatedTotal: normalizeDecimalString(String(row.estimated_total)) ?? "0",
      messageCount: Number(row.message_count ?? 0),
      pendingCount: Number(row.pending_count ?? 0),
      unavailableCount: Number(row.unavailable_count ?? 0),
    }));
  },

  async breakdownByTemplate(filters: CostLedgerFilters): Promise<TemplateBreakdownRow[]> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT
        l.message_kind,
        l.template_sid,
        l.template_name,
        l.flow_label,
        l.pricing_category,
        COALESCE(l.currency, N'UNK') AS currency,
        COUNT(*) AS message_count,
        SUM(CASE WHEN l.cost_quality = N'PENDING' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN l.cost_quality = N'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_count,
        COALESCE(SUM(CASE WHEN l.cost_quality = N'CONFIRMED' THEN ABS(l.price_amount) ELSE 0 END), 0) AS confirmed_total,
        COALESCE(SUM(CASE WHEN l.cost_quality = N'ESTIMATED' THEN ABS(l.price_amount) ELSE 0 END), 0) AS estimated_total
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where}
      GROUP BY
        l.message_kind,
        l.template_sid,
        l.template_name,
        l.flow_label,
        l.pricing_category,
        COALESCE(l.currency, N'UNK')
      ORDER BY message_count DESC, l.message_kind ASC;
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      messageKind: String(row.message_kind),
      templateSid: row.template_sid ? String(row.template_sid) : null,
      templateName: row.template_name ? String(row.template_name) : null,
      flowLabel: row.flow_label ? String(row.flow_label) : null,
      pricingCategory: row.pricing_category ? String(row.pricing_category) : null,
      currency: row.currency ? String(row.currency) : null,
      confirmedTotal: normalizeDecimalString(String(row.confirmed_total)) ?? "0",
      estimatedTotal: normalizeDecimalString(String(row.estimated_total)) ?? "0",
      messageCount: Number(row.message_count ?? 0),
      pendingCount: Number(row.pending_count ?? 0),
      unavailableCount: Number(row.unavailable_count ?? 0),
    }));
  },

  async listDetail(
    filters: CostLedgerFilters,
    page: number,
    limit: number,
  ): Promise<{ rows: WhatsappMessageCostLedgerRow[]; total: number }> {
    const pool = getPool();
    const countRequest = pool.request();
    const where = applyFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where};
    `);
    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);

    const listRequest = pool.request();
    const listWhere = applyFilters(listRequest, filters);
    const offset = (page - 1) * limit;
    listRequest.input("offset", sql.Int, offset);
    listRequest.input("limit", sql.Int, limit);
    const listResult = await listRequest.query(`
      SELECT *
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${listWhere}
      ORDER BY l.sent_at DESC, l.id DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    `);

    return {
      rows: (listResult.recordset as Array<Record<string, unknown>>).map(mapLedgerRow),
      total,
    };
  },

  async listForExport(
    filters: CostLedgerFilters,
    maxRows: number,
  ): Promise<WhatsappMessageCostLedgerRow[]> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    request.input("maxRows", sql.Int, maxRows);
    const result = await request.query(`
      SELECT TOP (@maxRows) *
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where}
      ORDER BY l.sent_at DESC, l.id DESC;
    `);
    return (result.recordset as Array<Record<string, unknown>>).map(mapLedgerRow);
  },

  async getLastSyncedAt(filters: CostLedgerFilters): Promise<Date | null> {
    const pool = getPool();
    const request = pool.request();
    const where = applyFilters(request, filters);
    const result = await request.query(`
      SELECT MAX(last_synced_at) AS last_synced_at
      FROM dbo.whatsapp_message_cost_ledger l
      WHERE ${where};
    `);
    const value = (result.recordset[0] as { last_synced_at: Date | null } | undefined)
      ?.last_synced_at;
    return value ? toDate(value) : null;
  },

  async getHeartbeat(): Promise<CostSyncHeartbeat> {
    const pool = getPool();
    try {
      const result = await pool.request().query(`
        SELECT last_run_at, last_success_at, last_result_json
        FROM dbo.whatsapp_message_cost_sync_heartbeat
        WHERE id = 1;
      `);
      const row = result.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        return { lastRunAt: null, lastSuccessAt: null, lastResultJson: null };
      }
      return {
        lastRunAt: row.last_run_at ? toDate(row.last_run_at) : null,
        lastSuccessAt: row.last_success_at ? toDate(row.last_success_at) : null,
        lastResultJson: row.last_result_json ? String(row.last_result_json) : null,
      };
    } catch {
      return { lastRunAt: null, lastSuccessAt: null, lastResultJson: null };
    }
  },

  /**
   * Persist worker liveness + last tick summary.
   * Skip the singleton UPDATE when the payload is unchanged and last_run_at
   * was touched recently (still well under the 15-minute UI stale threshold).
   */
  async recordHeartbeat(input: {
    success: boolean;
    result: Record<string, unknown>;
  }): Promise<void> {
    const pool = getPool();
    const json = JSON.stringify(input.result).slice(0, 1500);
    try {
      await pool
        .request()
        .input("success", sql.Bit, input.success ? 1 : 0)
        .input("resultJson", sql.NVarChar(1500), json)
        .input("touchMinutes", sql.Int, COST_SYNC_HEARTBEAT_TOUCH_MINUTES)
        .query(`
          UPDATE dbo.whatsapp_message_cost_sync_heartbeat
          SET last_run_at = SYSUTCDATETIME(),
              last_success_at = CASE WHEN @success = 1 THEN SYSUTCDATETIME() ELSE last_success_at END,
              last_result_json = @resultJson,
              updated_at = SYSUTCDATETIME()
          WHERE id = 1
            AND (
              last_run_at IS NULL
              OR last_result_json IS NULL
              OR last_result_json <> @resultJson
              OR last_run_at < DATEADD(MINUTE, -@touchMinutes, SYSUTCDATETIME())
            );
        `);
    } catch (error) {
      console.warn("[whatsapp-message-cost] heartbeat update failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
