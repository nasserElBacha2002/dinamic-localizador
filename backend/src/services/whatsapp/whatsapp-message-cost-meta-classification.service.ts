import type { MessageCostKind } from "../../constants/whatsapp-message-cost";
import type { MetaBillingCategory } from "../../constants/whatsapp-message-cost";
import { whatsappContentSidMetaCategoryRepository } from "../../repositories/whatsapp/whatsapp-content-sid-meta-category.repository";

export interface MetaClassificationInput {
  direction: "INBOUND" | "OUTBOUND";
  messageKind: MessageCostKind;
  templateSid?: string | null;
  sentAt: Date;
  /** When null, SERVICE eligibility for TwiML/session replies cannot be verified. */
  customerServiceWindowOpen: boolean | null;
}

export const whatsappMessageCostMetaClassificationService = {
  async classify(input: MetaClassificationInput): Promise<MetaBillingCategory> {
    if (input.direction === "INBOUND") {
      return "NONE_INBOUND";
    }

    if (input.templateSid) {
      const mapped = await whatsappContentSidMetaCategoryRepository.findCategoryAt(
        input.templateSid,
        input.sentAt,
      );
      if (mapped) {
        return mapped;
      }
      return "UNCLASSIFIED";
    }

    if (input.messageKind === "BOT_TWIML" || input.messageKind === "TEXT") {
      if (input.customerServiceWindowOpen === true) {
        return "SERVICE";
      }
      return "UNCLASSIFIED";
    }

    return "UNCLASSIFIED";
  },
};