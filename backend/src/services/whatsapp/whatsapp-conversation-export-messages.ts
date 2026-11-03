import type { WhatsAppMessage } from "../../types/twilio.types";
import { whatsappObservabilityRepository } from "../../repositories/whatsapp/whatsapp-observability.repository";

/** Safety cap to avoid unbounded memory; exportMeta must reflect any incomplete export. */
export const WHATSAPP_EXPORT_MESSAGE_HARD_CAP = 50_000;
const EXPORT_PAGE_SIZE = 500;

export type ConversationExportMessageLoad = {
  messages: WhatsAppMessage[];
  totalMessageCount: number;
  exportedMessageCount: number;
  expectedExportCount: number;
  truncatedByHardCap: boolean;
  incompleteLoad: boolean;
  truncated: boolean;
};

export const loadConversationMessagesForExport = async (
  conversationId: string,
): Promise<ConversationExportMessageLoad> => {
  const totalMessageCount = await whatsappObservabilityRepository.countMessagesByConversation(
    conversationId,
  );
  const expectedExportCount = Math.min(totalMessageCount, WHATSAPP_EXPORT_MESSAGE_HARD_CAP);
  const truncatedByHardCap = totalMessageCount > WHATSAPP_EXPORT_MESSAGE_HARD_CAP;

  const messages: WhatsAppMessage[] = [];
  let afterCreatedAt: string | null = null;
  let afterId: string | null = null;

  while (messages.length < expectedExportCount) {
    const page = await whatsappObservabilityRepository.listMessagesAscPage({
      conversationId,
      limit: Math.min(EXPORT_PAGE_SIZE, expectedExportCount - messages.length),
      afterCreatedAt,
      afterId,
    });
    if (page.length === 0) {
      break;
    }
    messages.push(...page);
    const last = page[page.length - 1]!;
    afterCreatedAt = last.createdAt;
    afterId = last.id;
  }

  const exportedMessageCount = messages.length;
  const incompleteLoad = exportedMessageCount < expectedExportCount;
  const truncated = truncatedByHardCap || incompleteLoad;

  return {
    messages,
    totalMessageCount,
    exportedMessageCount,
    expectedExportCount,
    truncatedByHardCap,
    incompleteLoad,
    truncated,
  };
};
