export type MessageCostQuality = "CONFIRMED" | "ESTIMATED" | "PENDING" | "UNAVAILABLE";

export type WorkerOperationalStatus =
  | "PROVIDER_NOT_CONFIGURED"
  | "WORKER_DISABLED"
  | "WORKER_ACTIVE"
  | "WORKER_STALE"
  | "UNKNOWN";

export interface MessageCostMonthFilters {
  year: number;
  month: number;
  companyId?: string;
  messageKind?: string;
  templateSid?: string;
  providerStatus?: string;
  costQuality?: MessageCostQuality;
  page?: number;
  limit?: number;
}

export interface MessageCostCurrencyTotal {
  currency: string | null;
  confirmedTotal: string;
  estimatedTotal: string;
  twilioConfirmedTotal: string;
  twilioEstimatedTotal: string;
  metaConfirmedTotal: string;
  metaEstimatedTotal: string;
  combinedConfirmedTotal: string;
  combinedEstimatedTotal: string;
  inboundCount: number;
  outboundCount: number;
  serviceFreeTierUsedCount: number;
  messageCount: number;
  confirmedCount: number;
  estimatedCount: number;
  pendingCount: number;
  unavailableCount: number;
  pendingWithoutCurrencyCount: number;
}

export interface MessageCostMonthlySummary {
  year: number;
  month: number;
  timezone: string;
  accountingBasis: string;
  billingScope: string;
  billingScopeNote: string;
  providerConfigured: boolean;
  syncWorkerEnabled: boolean;
  workerOperationalStatus: WorkerOperationalStatus;
  lastWorkerRunAt: string | null;
  lastSuccessfulWorkerRunAt: string | null;
  lastWorkerResult: Record<string, unknown> | null;
  partiallySynced: boolean;
  hasUnavailable: boolean;
  hasUnknownCostComponents: boolean;
  periodComplete: boolean;
  lastSyncedAt: string | null;
  totals: {
    messageCount: number;
    pendingCount: number;
    unavailableCount: number;
    confirmedCount: number;
    estimatedCount: number;
    pendingWithoutCurrencyCount: number;
    sentCount: number;
    deliveredCount: number;
    readCount: number;
    failedCount: number;
    inboundCount: number;
    outboundCount: number;
    serviceFreeTierUsedCount: number;
    twilioConfirmedTotal: string | null;
    twilioEstimatedTotal: string | null;
    metaConfirmedTotal: string | null;
    metaEstimatedTotal: string | null;
    combinedConfirmedTotal: string | null;
    combinedEstimatedTotal: string | null;
    twilioSummaryCurrency: string | null;
    metaSummaryCurrency: string | null;
    summaryCurrency: string | null;
    twilioPendingCount: number;
    metaPendingCount: number;
  };
  byTwilioCurrency: MessageCostComponentCurrencyTotal[];
  byMetaCurrency: MessageCostComponentCurrencyTotal[];
  /** @deprecated use byTwilioCurrency / byMetaCurrency */
  byCurrency: MessageCostCurrencyTotal[];
}

export interface MessageCostComponentCurrencyTotal {
  currency: string | null;
  confirmedTotal: string;
  estimatedTotal: string;
  messageCount: number;
  confirmedCount: number;
  estimatedCount: number;
  pendingCount: number;
  unavailableCount: number;
  pendingWithoutCurrencyCount?: number;
  serviceFreeTierUsedCount?: number;
}

export interface MessageCostCompanyBreakdownItem {
  companyId: string | null;
  companyName: string | null;
  currency: string | null;
  confirmedTotal: string;
  estimatedTotal: string;
  messageCount: number;
  pendingCount: number;
  unavailableCount: number;
}

export interface MessageCostTemplateBreakdownItem {
  messageKind: string;
  templateSid: string | null;
  templateName: string | null;
  flowLabel: string | null;
  pricingCategory: string | null;
  currency: string | null;
  confirmedTotal: string;
  estimatedTotal: string;
  messageCount: number;
  pendingCount: number;
  unavailableCount: number;
}

export interface MessageCostDetailRow {
  id: string;
  companyId: string | null;
  companyNameSnapshot?: string | null;
  direction: "INBOUND" | "OUTBOUND";
  providerMessageSid: string | null;
  sentAt: string;
  recipientPhoneMasked: string | null;
  senderPhoneMasked?: string | null;
  destinationCountryCode?: string | null;
  messageKind: string;
  templateSid: string | null;
  templateName: string | null;
  flowLabel: string | null;
  providerStatus: string | null;
  pricingCategory: string | null;
  priceAmount: string | null;
  currency: string | null;
  metaBillingCategory: string | null;
  metaPriceAmount: string | null;
  metaCurrency: string | null;
  metaCostQuality: MessageCostQuality | null;
  metaCostSource: string | null;
  serviceMonthRank: number | null;
  metaCostNote: string | null;
  costQuality: MessageCostQuality;
  costSource: string;
  lastSyncedAt: string | null;
  syncAttemptCount: number;
  lastSyncErrorCode: string | null;
}