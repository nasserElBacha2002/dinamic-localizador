import type { MessageCostFlowLabel, MessageCostKind } from "../constants/whatsapp-message-cost";
import { whatsappMessageCostLedgerRepository } from "../repositories/whatsapp-message-cost-ledger.repository";
import { maskPhoneNumberForLog } from "../utils/phone";

export interface RecordOutboundMessageCostInput {
  companyId: string | null;
  providerMessageSid: string | null;
  toPhoneNumber: string;
  messageKind: MessageCostKind;
  templateSid?: string | null;
  templateName?: string | null;
  flowLabel?: MessageCostFlowLabel | string | null;
  providerStatus?: string | null;
  whatsappMessageId?: string | null;
  sentAt?: Date;
}

/**
 * Best-effort cost ledger write. Never throws to the caller —
 * Twilio accept must not be rolled back / retried because of observability.
 */
export const whatsappMessageCostRecordService = {
  async recordOutboundAccepted(input: RecordOutboundMessageCostInput): Promise<void> {
    try {
      if (!input.providerMessageSid) {
        await whatsappMessageCostLedgerRepository.insertIgnoreDuplicate({
          companyId: input.companyId,
          whatsappMessageId: input.whatsappMessageId ?? null,
          providerMessageSid: null,
          direction: "OUTBOUND",
          sentAt: input.sentAt ?? new Date(),
          recipientPhoneMasked: maskPhoneNumberForLog(input.toPhoneNumber),
          messageKind: input.messageKind,
          templateSid: input.templateSid ?? null,
          templateName: input.templateName ?? null,
          flowLabel: input.flowLabel ?? null,
          providerStatus: input.providerStatus ?? "SEND_ACCEPTED",
          costQuality: "UNAVAILABLE",
          costSource: "NONE",
          lastSyncErrorCode: "NO_PROVIDER_SID",
          lastSyncErrorMessage: "Outbound accept without Twilio MessageSid",
        });
        return;
      }

      await whatsappMessageCostLedgerRepository.insertIgnoreDuplicate({
        companyId: input.companyId,
        whatsappMessageId: input.whatsappMessageId ?? null,
        providerMessageSid: input.providerMessageSid,
        direction: "OUTBOUND",
        sentAt: input.sentAt ?? new Date(),
        recipientPhoneMasked: maskPhoneNumberForLog(input.toPhoneNumber),
        messageKind: input.messageKind,
        templateSid: input.templateSid ?? null,
        templateName: input.templateName ?? null,
        flowLabel: input.flowLabel ?? null,
        providerStatus: input.providerStatus ?? "SEND_ACCEPTED",
        costQuality: "PENDING",
        costSource: "NONE",
        nextSyncAt: new Date(),
      });
    } catch (error) {
      console.warn("[whatsapp-message-cost] ledger insert failed (non-blocking)", {
        companyId: input.companyId,
        messageKind: input.messageKind,
        flowLabel: input.flowLabel ?? null,
        hasSid: Boolean(input.providerMessageSid),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
