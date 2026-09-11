import { MESSAGE_COST_BILLING_SCOPE } from "../constants/whatsapp-message-cost";
import { env } from "../config/env";
import {
  whatsappMessageCostLedgerRepository,
  type CostLedgerFilters,
  type WhatsappMessageCostLedgerRow,
} from "../repositories/whatsapp-message-cost-ledger.repository";
import type {
  MessageCostDetailQuery,
  MessageCostMonthQuery,
  MessageCostResyncBody,
} from "../schemas/whatsapp-message-cost.schema";
import { auditService } from "./audit.service";
import { buildCsv } from "../utils/csv";
import { getMonthUtcBounds } from "../utils/month-utc-bounds";

const WORKER_STALE_MS = 15 * 60 * 1000;

const buildFilters = (query: MessageCostMonthQuery): CostLedgerFilters => {
  const bounds = getMonthUtcBounds(query.year, query.month, env.BOT_OPERATION_TIMEZONE);
  return {
    companyId: query.companyId,
    messageKind: query.messageKind,
    templateSid: query.templateSid,
    providerStatus: query.providerStatus,
    costQuality: query.costQuality,
    monthStartUtc: bounds.monthStartUtc,
    nextMonthStartUtc: bounds.nextMonthStartUtc,
  };
};

const mapDetailRow = (row: WhatsappMessageCostLedgerRow) => ({
  id: row.id,
  companyId: row.companyId,
  companyNameSnapshot: row.companyNameSnapshot,
  providerMessageSid: row.providerMessageSid,
  sentAt: row.sentAt.toISOString(),
  recipientPhoneMasked: row.recipientPhoneMasked,
  messageKind: row.messageKind,
  templateSid: row.templateSid,
  templateName: row.templateName,
  flowLabel: row.flowLabel,
  providerStatus: row.providerStatus,
  providerStatusAt: row.providerStatusAt?.toISOString() ?? null,
  pricingCategory: row.pricingCategory,
  priceAmount: row.priceAmount,
  currency: row.currency,
  costQuality: row.costQuality,
  costSource: row.costSource,
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  syncAttemptCount: row.syncAttemptCount,
  lastSyncErrorCode: row.lastSyncErrorCode,
});

export const whatsappMessageCostQueryService = {
  async getMonthlySummary(query: MessageCostMonthQuery) {
    const filters = buildFilters(query);
    const byCurrency = await whatsappMessageCostLedgerRepository.summarizeByCurrency(filters);
    const lastSyncedAt = await whatsappMessageCostLedgerRepository.getLastSyncedAt(filters);
    const heartbeat = await whatsappMessageCostLedgerRepository.getHeartbeat();

    const totals = byCurrency.reduce(
      (acc, row) => {
        acc.messageCount += row.messageCount;
        acc.pendingCount += row.pendingCount;
        acc.unavailableCount += row.unavailableCount;
        acc.confirmedCount += row.confirmedCount;
        acc.estimatedCount += row.estimatedCount;
        acc.pendingWithoutCurrencyCount += row.pendingWithoutCurrencyCount;
        acc.sentCount += row.sentCount;
        acc.deliveredCount += row.deliveredCount;
        acc.readCount += row.readCount;
        acc.failedCount += row.failedCount;
        return acc;
      },
      {
        messageCount: 0,
        pendingCount: 0,
        unavailableCount: 0,
        confirmedCount: 0,
        estimatedCount: 0,
        pendingWithoutCurrencyCount: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
      },
    );

    const providerConfigured = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
    const syncWorkerEnabled = env.WHATSAPP_MESSAGE_COST_SYNC_WORKER_ENABLED;
    const lastWorkerRunAt = heartbeat.lastRunAt?.toISOString() ?? null;
    const lastSuccessfulWorkerRunAt = heartbeat.lastSuccessAt?.toISOString() ?? null;
    const workerStale =
      syncWorkerEnabled &&
      (!heartbeat.lastRunAt || Date.now() - heartbeat.lastRunAt.getTime() > WORKER_STALE_MS);

    let workerOperationalStatus:
      | "PROVIDER_NOT_CONFIGURED"
      | "WORKER_DISABLED"
      | "WORKER_ACTIVE"
      | "WORKER_STALE"
      | "UNKNOWN";
    if (!providerConfigured) {
      workerOperationalStatus = "PROVIDER_NOT_CONFIGURED";
    } else if (!syncWorkerEnabled) {
      workerOperationalStatus = "WORKER_DISABLED";
    } else if (workerStale) {
      workerOperationalStatus = "WORKER_STALE";
    } else {
      workerOperationalStatus = "WORKER_ACTIVE";
    }

    return {
      year: query.year,
      month: query.month,
      timezone: env.BOT_OPERATION_TIMEZONE,
      accountingBasis: "SERVER_SENT_AT_IN_BOT_OPERATION_TIMEZONE",
      billingScope: MESSAGE_COST_BILLING_SCOPE,
      billingScopeNote:
        "Los importes confirmados provienen de Twilio Message.price (tarifa de canal). " +
        "No incluyen tarifas de plantilla/conversación de Meta facturadas por Usage.",
      providerConfigured,
      syncWorkerEnabled,
      workerOperationalStatus,
      lastWorkerRunAt,
      lastSuccessfulWorkerRunAt,
      lastWorkerResult: heartbeat.lastResultJson
        ? (JSON.parse(heartbeat.lastResultJson) as Record<string, unknown>)
        : null,
      partiallySynced: totals.pendingCount > 0,
      hasUnavailable: totals.unavailableCount > 0,
      periodComplete:
        totals.pendingCount === 0 &&
        totals.unavailableCount === 0 &&
        totals.messageCount > 0,
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      totals,
      byCurrency: byCurrency.map((row) => ({
        currency: row.currency === "UNK" ? null : row.currency,
        confirmedTotal: row.confirmedTotal,
        estimatedTotal: row.estimatedTotal,
        messageCount: row.messageCount,
        confirmedCount: row.confirmedCount,
        estimatedCount: row.estimatedCount,
        pendingCount: row.pendingCount,
        unavailableCount: row.unavailableCount,
        pendingWithoutCurrencyCount: row.pendingWithoutCurrencyCount,
      })),
    };
  },

  async getCompanyBreakdown(query: MessageCostMonthQuery) {
    const filters = buildFilters(query);
    const rows = await whatsappMessageCostLedgerRepository.breakdownByCompany(filters);
    return {
      year: query.year,
      month: query.month,
      billingScope: MESSAGE_COST_BILLING_SCOPE,
      items: rows,
    };
  },

  async getTemplateBreakdown(query: MessageCostMonthQuery) {
    const filters = buildFilters(query);
    const rows = await whatsappMessageCostLedgerRepository.breakdownByTemplate(filters);
    return {
      year: query.year,
      month: query.month,
      billingScope: MESSAGE_COST_BILLING_SCOPE,
      items: rows,
    };
  },

  async listDetail(query: MessageCostDetailQuery) {
    const filters = buildFilters(query);
    const { rows, total } = await whatsappMessageCostLedgerRepository.listDetail(
      filters,
      query.page,
      query.limit,
    );
    return {
      data: rows.map(mapDetailRow),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
      billingScope: MESSAGE_COST_BILLING_SCOPE,
    };
  },

  async exportCsv(query: MessageCostMonthQuery): Promise<string> {
    const filters = buildFilters(query);
    const rows = await whatsappMessageCostLedgerRepository.listForExport(
      filters,
      env.WHATSAPP_MESSAGE_COST_EXPORT_MAX_ROWS,
    );

    return buildCsv(
      [
        "id",
        "companyId",
        "companyNameSnapshot",
        "providerMessageSid",
        "sentAt",
        "recipientPhoneMasked",
        "messageKind",
        "templateSid",
        "templateName",
        "flowLabel",
        "providerStatus",
        "pricingCategory",
        "priceAmount",
        "currency",
        "costQuality",
        "costSource",
        "lastSyncedAt",
        "syncAttemptCount",
        "lastSyncErrorCode",
      ],
      rows.map((row) => [
        row.id,
        row.companyId,
        row.companyNameSnapshot,
        row.providerMessageSid,
        row.sentAt.toISOString(),
        row.recipientPhoneMasked,
        row.messageKind,
        row.templateSid,
        row.templateName,
        row.flowLabel,
        row.providerStatus,
        row.pricingCategory,
        row.priceAmount,
        row.currency,
        row.costQuality,
        row.costSource,
        row.lastSyncedAt?.toISOString() ?? null,
        row.syncAttemptCount,
        row.lastSyncErrorCode,
      ]),
    );
  },

  async requestResync(
    body: MessageCostResyncBody,
    audit?: { userId: string | null; companyIdForAudit: string | null },
  ) {
    const bounds = getMonthUtcBounds(body.year, body.month, env.BOT_OPERATION_TIMEZONE);
    const updated = await whatsappMessageCostLedgerRepository.requestResync({
      companyId: body.companyId,
      monthStartUtc: bounds.monthStartUtc,
      nextMonthStartUtc: bounds.nextMonthStartUtc,
      ledgerIds: body.ledgerIds,
      maxRows: body.maxRows,
    });

    if (audit?.companyIdForAudit) {
      try {
        await auditService.log(audit.companyIdForAudit, {
          entityType: "whatsapp_message_cost_ledger",
          entityId: body.companyId ?? audit.companyIdForAudit,
          action: "MESSAGE_COST_RESYNC",
          userId: audit.userId,
          newData: {
            year: body.year,
            month: body.month,
            companyId: body.companyId ?? null,
            ledgerIdsCount: body.ledgerIds?.length ?? 0,
            maxRows: body.maxRows,
            updated,
          },
          reason: "Platform admin requested WhatsApp message cost resync",
        });
      } catch (error) {
        console.warn("[whatsapp-message-cost] resync audit failed (non-blocking)", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { updated };
  },
};
