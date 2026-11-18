import { MESSAGE_COST_BILLING_SCOPE } from "../../constants/whatsapp-message-cost";
import { env } from "../../config/env";
import {
  whatsappMessageCostLedgerRepository,
  type CostLedgerFilters,
  type WhatsappMessageCostLedgerRow,
} from "../../repositories/whatsapp/whatsapp-message-cost-ledger.repository";
import type {
  MessageCostDetailQuery,
  MessageCostMonthQuery,
  MessageCostResyncBody,
} from "../../schemas/whatsapp-message-cost.schema";
import { auditService } from "../audit.service";
import { buildCsv } from "../../utils/csv";
import { getMonthUtcBounds } from "../../utils/month-utc-bounds";
import { sumDecimalStrings } from "../../utils/money-decimal";

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
  direction: row.direction,
  providerMessageSid: row.providerMessageSid,
  sentAt: row.sentAt.toISOString(),
  recipientPhoneMasked: row.recipientPhoneMasked,
  senderPhoneMasked: row.senderPhoneMasked,
  destinationCountryCode: row.destinationCountryCode,
  messageKind: row.messageKind,
  templateSid: row.templateSid,
  templateName: row.templateName,
  flowLabel: row.flowLabel,
  providerStatus: row.providerStatus,
  providerStatusAt: row.providerStatusAt?.toISOString() ?? null,
  pricingCategory: row.pricingCategory,
  priceAmount: row.priceAmount,
  currency: row.currency,
  metaBillingCategory: row.metaBillingCategory,
  metaPriceAmount: row.metaPriceAmount,
  metaCurrency: row.metaCurrency,
  metaCostQuality: row.metaCostQuality,
  metaCostSource: row.metaCostSource,
  serviceMonthRank: row.serviceMonthRank,
  metaCostNote: row.metaCostNote,
  costQuality: row.costQuality,
  costSource: row.costSource,
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  syncAttemptCount: row.syncAttemptCount,
  lastSyncErrorCode: row.lastSyncErrorCode,
});

export const whatsappMessageCostQueryService = {
  async getMonthlySummary(query: MessageCostMonthQuery) {
    const filters = buildFilters(query);
    const [twilioByCurrency, metaByCurrency, aggregateCounts] = await Promise.all([
      whatsappMessageCostLedgerRepository.summarizeTwilioByCurrency(filters),
      whatsappMessageCostLedgerRepository.summarizeMetaByCurrency(filters),
      whatsappMessageCostLedgerRepository.summarizeAggregateCounts(filters),
    ]);
    const lastSyncedAt = await whatsappMessageCostLedgerRepository.getLastSyncedAt(filters);
    const heartbeat = await whatsappMessageCostLedgerRepository.getHeartbeat();

    const twilioConfirmedCount = twilioByCurrency.reduce((acc, row) => acc + row.confirmedCount, 0);
    const twilioEstimatedCount = twilioByCurrency.reduce((acc, row) => acc + row.estimatedCount, 0);
    const metaConfirmedCount = metaByCurrency.reduce((acc, row) => acc + row.confirmedCount, 0);
    const metaEstimatedCount = metaByCurrency.reduce((acc, row) => acc + row.estimatedCount, 0);
    const serviceFreeTierUsedCount = metaByCurrency.reduce(
      (acc, row) => acc + row.serviceFreeTierUsedCount,
      0,
    );
    const pendingWithoutCurrencyCount = twilioByCurrency.reduce(
      (acc, row) => acc + row.pendingWithoutCurrencyCount,
      0,
    );

    const twilioCurrencies = twilioByCurrency.filter((r) => r.currency !== "UNK");
    const metaCurrencies = metaByCurrency.filter((r) => r.currency !== "UNK_META");
    const twilioSummaryCurrency =
      twilioCurrencies.length === 1 ? twilioCurrencies[0]?.currency ?? null : null;
    const metaSummaryCurrency =
      metaCurrencies.length === 1 ? metaCurrencies[0]?.currency ?? null : null;

    const monetaryTotals = {
      twilioConfirmedTotal:
        twilioSummaryCurrency && twilioByCurrency.length > 0
          ? sumDecimalStrings(twilioByCurrency.map((row) => row.twilioConfirmedTotal))
          : null,
      twilioEstimatedTotal:
        twilioSummaryCurrency && twilioByCurrency.length > 0
          ? sumDecimalStrings(twilioByCurrency.map((row) => row.twilioEstimatedTotal))
          : null,
      metaConfirmedTotal:
        metaSummaryCurrency && metaByCurrency.length > 0
          ? sumDecimalStrings(metaByCurrency.map((row) => row.metaConfirmedTotal))
          : null,
      metaEstimatedTotal:
        metaSummaryCurrency && metaByCurrency.length > 0
          ? sumDecimalStrings(metaByCurrency.map((row) => row.metaEstimatedTotal))
          : null,
      combinedConfirmedTotal: null,
      combinedEstimatedTotal: null,
      twilioSummaryCurrency,
      metaSummaryCurrency,
      summaryCurrency: null,
    };

    const hasUnknownCostComponents =
      aggregateCounts.twilioPendingCount > 0 ||
      aggregateCounts.metaPendingCount > 0 ||
      aggregateCounts.unavailableCount > 0;

    const totals = {
      messageCount: aggregateCounts.messageCount,
      pendingCount: aggregateCounts.pendingCount,
      unavailableCount: aggregateCounts.unavailableCount,
      confirmedCount: twilioConfirmedCount + metaConfirmedCount,
      estimatedCount: twilioEstimatedCount + metaEstimatedCount,
      pendingWithoutCurrencyCount,
      sentCount: aggregateCounts.sentCount,
      deliveredCount: aggregateCounts.deliveredCount,
      readCount: aggregateCounts.readCount,
      failedCount: aggregateCounts.failedCount,
      inboundCount: aggregateCounts.inboundCount,
      outboundCount: aggregateCounts.outboundCount,
      serviceFreeTierUsedCount,
      twilioPendingCount: aggregateCounts.twilioPendingCount,
      metaPendingCount: aggregateCounts.metaPendingCount,
      ...monetaryTotals,
    };

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
        "Twilio (canal): importes CONFIRMED desde Message.price cuando está disponible; " +
        "ESTIMATED desde tarifario o referencia USD 0,005 sin sustituir importes reales. " +
        "Meta: ESTIMATED/CONFIRMED por tarifario versionado y política SERVICE (1.000 gratis/mes " +
        "por remitente desde 2026-10-01). El total combinado no equivale a factura hasta conciliación.",
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
      hasUnknownCostComponents,
      periodComplete: !hasUnknownCostComponents && totals.messageCount > 0,
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      totals,
      byTwilioCurrency: twilioByCurrency.map((row) => ({
        currency: row.currency === "UNK" ? null : row.currency,
        confirmedTotal: row.twilioConfirmedTotal,
        estimatedTotal: row.twilioEstimatedTotal,
        messageCount: row.messageCount,
        confirmedCount: row.confirmedCount,
        estimatedCount: row.estimatedCount,
        pendingCount: row.pendingCount,
        unavailableCount: row.unavailableCount,
        pendingWithoutCurrencyCount: row.pendingWithoutCurrencyCount,
      })),
      byMetaCurrency: metaByCurrency.map((row) => ({
        currency: row.currency === "UNK_META" ? null : row.currency,
        confirmedTotal: row.metaConfirmedTotal,
        estimatedTotal: row.metaEstimatedTotal,
        messageCount: row.messageCount,
        confirmedCount: row.confirmedCount,
        estimatedCount: row.estimatedCount,
        pendingCount: row.pendingCount,
        unavailableCount: row.unavailableCount,
        serviceFreeTierUsedCount: row.serviceFreeTierUsedCount,
      })),
      /** @deprecated use byTwilioCurrency / byMetaCurrency */
      byCurrency: twilioByCurrency.map((row) => ({
        currency: row.currency === "UNK" ? null : row.currency,
        confirmedTotal: row.confirmedTotal,
        estimatedTotal: row.estimatedTotal,
        twilioConfirmedTotal: row.twilioConfirmedTotal,
        twilioEstimatedTotal: row.twilioEstimatedTotal,
        metaConfirmedTotal: "0",
        metaEstimatedTotal: "0",
        combinedConfirmedTotal: row.twilioConfirmedTotal,
        combinedEstimatedTotal: row.twilioEstimatedTotal,
        messageCount: row.messageCount,
        confirmedCount: row.confirmedCount,
        estimatedCount: row.estimatedCount,
        pendingCount: row.pendingCount,
        unavailableCount: row.unavailableCount,
        pendingWithoutCurrencyCount: row.pendingWithoutCurrencyCount,
        inboundCount: 0,
        outboundCount: 0,
        serviceFreeTierUsedCount: 0,
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
