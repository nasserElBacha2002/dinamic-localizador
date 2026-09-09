import type {
  MessageCostFlowLabel,
  MessageCostKind,
  MessageCostQuality,
  MessageCostSource,
} from "../constants/whatsapp-message-cost";
import { normalizeDecimalString } from "../utils/money-decimal";

export interface WhatsappMessageCostLedgerRow {
  id: string;
  companyId: string | null;
  companyNameSnapshot: string | null;
  whatsappMessageId: string | null;
  providerMessageSid: string | null;
  channel: string;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: Date;
  recipientPhoneMasked: string | null;
  messageKind: MessageCostKind;
  templateSid: string | null;
  templateName: string | null;
  flowLabel: string | null;
  providerStatus: string | null;
  providerStatusAt: Date | null;
  pricingCategory: string | null;
  priceAmount: string | null;
  currency: string | null;
  costQuality: MessageCostQuality;
  costSource: MessageCostSource;
  tariffId: string | null;
  lastSyncedAt: Date | null;
  syncAttemptCount: number;
  nextSyncAt: Date | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertCostLedgerInput {
  companyId: string | null;
  companyNameSnapshot?: string | null;
  whatsappMessageId?: string | null;
  providerMessageSid: string | null;
  direction: "INBOUND" | "OUTBOUND";
  sentAt: Date;
  recipientPhoneMasked: string | null;
  messageKind: MessageCostKind;
  templateSid?: string | null;
  templateName?: string | null;
  flowLabel?: MessageCostFlowLabel | string | null;
  providerStatus?: string | null;
  providerStatusAt?: Date | null;
  costQuality: MessageCostQuality;
  costSource: MessageCostSource;
  nextSyncAt?: Date | null;
  lastSyncErrorCode?: string | null;
  lastSyncErrorMessage?: string | null;
}

export interface CostLedgerFilters {
  companyId?: string;
  messageKind?: string;
  templateSid?: string;
  providerStatus?: string;
  costQuality?: MessageCostQuality;
  monthStartUtc: Date;
  nextMonthStartUtc: Date;
}

export interface CurrencyTotalRow {
  currency: string;
  confirmedTotal: string;
  estimatedTotal: string;
  messageCount: number;
  confirmedCount: number;
  estimatedCount: number;
  pendingCount: number;
  unavailableCount: number;
  pendingWithoutCurrencyCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
}

export interface CompanyBreakdownRow {
  companyId: string | null;
  companyName: string | null;
  currency: string | null;
  confirmedTotal: string;
  estimatedTotal: string;
  messageCount: number;
  pendingCount: number;
  unavailableCount: number;
}

export interface TemplateBreakdownRow {
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

export interface CostSyncHeartbeat {
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastResultJson: string | null;
}

export const toDate = (value: unknown): Date => {
  if (value instanceof Date) {
    return value;
  }
  return new Date(String(value));
};

export const toNullableDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return toDate(value);
};

export const decimalFromRow = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return normalizeDecimalString(String(value));
};

export const mapLedgerRow = (row: Record<string, unknown>): WhatsappMessageCostLedgerRow => ({
  id: String(row.id),
  companyId: row.company_id ? String(row.company_id) : null,
  companyNameSnapshot: row.company_name_snapshot ? String(row.company_name_snapshot) : null,
  whatsappMessageId: row.whatsapp_message_id ? String(row.whatsapp_message_id) : null,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  channel: String(row.channel),
  direction: String(row.direction) as "INBOUND" | "OUTBOUND",
  sentAt: toDate(row.sent_at),
  recipientPhoneMasked: row.recipient_phone_masked ? String(row.recipient_phone_masked) : null,
  messageKind: String(row.message_kind) as MessageCostKind,
  templateSid: row.template_sid ? String(row.template_sid) : null,
  templateName: row.template_name ? String(row.template_name) : null,
  flowLabel: row.flow_label ? String(row.flow_label) : null,
  providerStatus: row.provider_status ? String(row.provider_status) : null,
  providerStatusAt: toNullableDate(row.provider_status_at),
  pricingCategory: row.pricing_category ? String(row.pricing_category) : null,
  priceAmount: decimalFromRow(row.price_amount),
  currency: row.currency ? String(row.currency) : null,
  costQuality: String(row.cost_quality) as MessageCostQuality,
  costSource: String(row.cost_source) as MessageCostSource,
  tariffId: row.tariff_id ? String(row.tariff_id) : null,
  lastSyncedAt: toNullableDate(row.last_synced_at),
  syncAttemptCount: Number(row.sync_attempt_count ?? 0),
  nextSyncAt: toNullableDate(row.next_sync_at),
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: toNullableDate(row.lease_expires_at),
  lastSyncErrorCode: row.last_sync_error_code ? String(row.last_sync_error_code) : null,
  lastSyncErrorMessage: row.last_sync_error_message
    ? String(row.last_sync_error_message)
    : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});
