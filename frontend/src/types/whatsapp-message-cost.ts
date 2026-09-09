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
  };
  byCurrency: MessageCostCurrencyTotal[];
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
  providerMessageSid: string | null;
  sentAt: string;
  recipientPhoneMasked: string | null;
  messageKind: string;
  templateSid: string | null;
  templateName: string | null;
  flowLabel: string | null;
  providerStatus: string | null;
  pricingCategory: string | null;
  priceAmount: string | null;
  currency: string | null;
  costQuality: MessageCostQuality;
  costSource: string;
  lastSyncedAt: string | null;
  syncAttemptCount: number;
  lastSyncErrorCode: string | null;
}
