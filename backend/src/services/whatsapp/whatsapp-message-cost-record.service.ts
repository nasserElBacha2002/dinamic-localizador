import type { MessageCostFlowLabel, MessageCostKind } from "../../constants/whatsapp-message-cost";
import { env } from "../../config/env";
import { whatsappMessageCostLedgerRepository } from "../../repositories/whatsapp/whatsapp-message-cost-ledger.repository";
import { deriveDestinationCountryCode } from "../../utils/whatsapp/whatsapp-destination-country";
import { maskPhoneNumberForLog } from "../../utils/phone";
import { formatWhatsAppAddress } from "../../utils/whatsapp/whatsapp-phone";
import { whatsappMessageCostMetaClassificationService } from "./whatsapp-message-cost-meta-classification.service";
import { whatsappMessageCostMetaPricingService } from "./whatsapp-message-cost-meta-pricing.service";
import { buildSenderBillingKey } from "../../utils/whatsapp/whatsapp-sender-billing-key";

export interface RecordOutboundMessageCostInput {
  companyId: string | null;
  providerMessageSid: string | null;
  toPhoneNumber: string;
  fromPhoneNumber?: string | null;
  messageKind: MessageCostKind;
  templateSid?: string | null;
  templateName?: string | null;
  flowLabel?: MessageCostFlowLabel | string | null;
  providerStatus?: string | null;
  whatsappMessageId?: string | null;
  sentAt?: Date;
  customerServiceWindowOpen?: boolean | null;
}

export interface RecordInboundMessageCostInput {
  companyId: string | null;
  providerMessageSid: string;
  fromPhoneNumber: string;
  toPhoneNumber?: string | null;
  messageKind: MessageCostKind;
  whatsappMessageId?: string | null;
  sentAt?: Date;
}

export interface RecordTwimlOutboundCostInput {
  companyId: string | null;
  whatsappMessageId: string;
  toPhoneNumber: string;
  fromPhoneNumber?: string | null;
  flowLabel?: string | null;
  sentAt?: Date;
  customerServiceWindowOpen?: boolean | null;
}

const defaultSender = (): string | null =>
  env.TWILIO_WHATSAPP_NUMBER ? formatWhatsAppAddress(env.TWILIO_WHATSAPP_NUMBER) : null;

const applyMetaIfInserted = async (
  ledgerId: string | null,
  customerServiceWindowOpen: boolean | null,
): Promise<void> => {
  if (!ledgerId) {
    return;
  }
  const row = await whatsappMessageCostLedgerRepository.getById(ledgerId);
  if (!row) {
    return;
  }
  await whatsappMessageCostMetaPricingService.applyForLedgerRow(row, {
    customerServiceWindowOpen,
  });
};

/**
 * Best-effort cost ledger write. Never throws to the caller —
 * Twilio accept must not be rolled back / retried because of observability.
 */
export const whatsappMessageCostRecordService = {
  async recordOutboundAccepted(input: RecordOutboundMessageCostInput): Promise<void> {
    try {
      const sentAt = input.sentAt ?? new Date();
      const sender = input.fromPhoneNumber ?? defaultSender();
      const metaBillingCategory = await whatsappMessageCostMetaClassificationService.classify({
        direction: "OUTBOUND",
        messageKind: input.messageKind,
        templateSid: input.templateSid,
        sentAt,
        customerServiceWindowOpen: input.customerServiceWindowOpen ?? null,
      });

      const baseFields = {
        companyId: input.companyId,
        whatsappMessageId: input.whatsappMessageId ?? null,
        direction: "OUTBOUND" as const,
        sentAt,
        recipientPhoneMasked: maskPhoneNumberForLog(input.toPhoneNumber),
        senderPhoneMasked: sender ? maskPhoneNumberForLog(sender) : null,
        senderBillingKey: buildSenderBillingKey(sender),
        metaCswOpen: input.customerServiceWindowOpen ?? null,
        destinationCountryCode: deriveDestinationCountryCode(input.toPhoneNumber),
        messageKind: input.messageKind,
        templateSid: input.templateSid ?? null,
        templateName: input.templateName ?? null,
        flowLabel: input.flowLabel ?? null,
        providerStatus: input.providerStatus ?? "SEND_ACCEPTED",
        metaBillingCategory,
        metaCostQuality: "PENDING" as const,
        metaCostSource: "NONE" as const,
      };

      if (!input.providerMessageSid) {
        const id = await whatsappMessageCostLedgerRepository.insertIgnoreDuplicate({
          ...baseFields,
          providerMessageSid: null,
          messageKind: input.messageKind,
          costQuality: "UNAVAILABLE",
          costSource: "NONE",
          lastSyncErrorCode: "NO_PROVIDER_SID",
          lastSyncErrorMessage: "Outbound accept without Twilio MessageSid",
        });
        await applyMetaIfInserted(id, input.customerServiceWindowOpen ?? null);
        return;
      }

      const id = await whatsappMessageCostLedgerRepository.insertIgnoreDuplicate({
        ...baseFields,
        providerMessageSid: input.providerMessageSid,
        costQuality: "PENDING",
        costSource: "NONE",
        nextSyncAt: new Date(),
      });
      await applyMetaIfInserted(id, input.customerServiceWindowOpen ?? null);
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

  async recordInboundMessage(input: RecordInboundMessageCostInput): Promise<void> {
    try {
      const sentAt = input.sentAt ?? new Date();
      const sender = input.fromPhoneNumber;
      const recipient = input.toPhoneNumber ?? defaultSender();
      const metaBillingCategory = await whatsappMessageCostMetaClassificationService.classify({
        direction: "INBOUND",
        messageKind: input.messageKind,
        sentAt,
        customerServiceWindowOpen: null,
      });

      const id = await whatsappMessageCostLedgerRepository.insertIgnoreDuplicate({
        companyId: input.companyId,
        whatsappMessageId: input.whatsappMessageId ?? null,
        providerMessageSid: input.providerMessageSid,
        direction: "INBOUND",
        sentAt,
        recipientPhoneMasked: recipient ? maskPhoneNumberForLog(recipient) : null,
        senderPhoneMasked: maskPhoneNumberForLog(sender),
        senderBillingKey: buildSenderBillingKey(sender),
        metaCswOpen: null,
        destinationCountryCode: deriveDestinationCountryCode(sender),
        messageKind: input.messageKind,
        templateSid: null,
        templateName: null,
        flowLabel: null,
        providerStatus: "received",
        metaBillingCategory,
        metaCostQuality: "PENDING",
        metaCostSource: "NONE",
        costQuality: "PENDING",
        costSource: "NONE",
        nextSyncAt: new Date(),
      });
      await applyMetaIfInserted(id, null);
    } catch (error) {
      console.warn("[whatsapp-message-cost] inbound ledger insert failed (non-blocking)", {
        companyId: input.companyId,
        messageSid: input.providerMessageSid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async recordTwimlOutbound(input: RecordTwimlOutboundCostInput): Promise<void> {
    try {
      const sentAt = input.sentAt ?? new Date();
      const sender = input.fromPhoneNumber ?? defaultSender();
      const metaBillingCategory = await whatsappMessageCostMetaClassificationService.classify({
        direction: "OUTBOUND",
        messageKind: "BOT_TWIML",
        sentAt,
        customerServiceWindowOpen: input.customerServiceWindowOpen ?? null,
      });

      const id = await whatsappMessageCostLedgerRepository.insertIgnoreDuplicate({
        companyId: input.companyId,
        whatsappMessageId: input.whatsappMessageId,
        providerMessageSid: null,
        direction: "OUTBOUND",
        sentAt,
        recipientPhoneMasked: maskPhoneNumberForLog(input.toPhoneNumber),
        senderPhoneMasked: sender ? maskPhoneNumberForLog(sender) : null,
        senderBillingKey: buildSenderBillingKey(sender),
        metaCswOpen: input.customerServiceWindowOpen ?? null,
        destinationCountryCode: deriveDestinationCountryCode(input.toPhoneNumber),
        messageKind: "BOT_TWIML",
        templateSid: null,
        templateName: null,
        flowLabel: input.flowLabel ?? null,
        providerStatus: "TWIML_RESPONSE_BUILT",
        metaBillingCategory,
        metaCostQuality: "PENDING",
        metaCostSource: "NONE",
        costQuality: "UNAVAILABLE",
        costSource: "NONE",
        lastSyncErrorCode: "NO_PROVIDER_SID",
        lastSyncErrorMessage: "TwiML outbound without Twilio MessageSid",
      });
      await applyMetaIfInserted(id, input.customerServiceWindowOpen ?? null);
    } catch (error) {
      console.warn("[whatsapp-message-cost] twiml ledger insert failed (non-blocking)", {
        companyId: input.companyId,
        whatsappMessageId: input.whatsappMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};