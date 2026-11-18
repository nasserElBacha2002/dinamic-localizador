import { whatsappMetaCswEvidenceRepository } from "../../repositories/whatsapp/whatsapp-meta-csw-evidence.repository";

export const whatsappMetaCswEvidenceService = {
  async resolveForOutbound(input: {
    companyId: string | null;
    customerPhone: string;
    at?: Date;
  }): Promise<boolean | null> {
    return whatsappMetaCswEvidenceRepository.resolveCustomerServiceWindowOpen({
      companyId: input.companyId,
      customerPhone: input.customerPhone,
      at: input.at ?? new Date(),
    });
  },

  /** Best-effort; never throws — cost observability must not block bot TwiML. */
  async resolveForOutboundSafe(input: {
    companyId: string | null;
    customerPhone: string;
    at?: Date;
  }): Promise<boolean | null> {
    try {
      return await this.resolveForOutbound(input);
    } catch (error) {
      console.warn("[whatsapp-message-cost] CSW evidence query failed (non-blocking)", {
        companyId: input.companyId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
};