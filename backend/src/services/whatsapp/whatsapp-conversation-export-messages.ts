import type { WhatsAppMessage } from "../../types/twilio.types";
import { whatsappObservabilityRepository } from "../../repositories/whatsapp/whatsapp-observability.repository";

/** Safety cap to avoid unbounded memory; exportMeta.truncated must be set when hit. */
export const WHATSAPP_EXPORT_MESSAGE_HARD_CAP = 50_000;
const EXPORT_PAGE_SIZE = 500;

export const loadConversationMessagesForExport = async (
  conversationId: string,
): Promise<{
  messages: WhatsAppMessage[];
  totalMessageCount: number;
  exportedMessageCount: number;
  truncated: boolean;
}> => {
  const totalMessageCount = await whatsappObservabilityRepository.countMessagesByConversation(
    conversationId,
  );
  const cap = Math.min(totalMessageCount, WHATSAPP_EXPORT_MESSAGE_HARD_CAP);
  const truncated = totalMessageCount > WHATSAPP_EXPORT_MESSAGE_HARD_CAP;

  const messages: WhatsAppMessage[] = [];
  let afterCreatedAt: string | null = null;
  let afterId: string | null = null;

  while (messages.length < cap) {
    const page = await whatsappObservabilityRepository.listMessagesAscPage({
      conversationId,
      limit: Math.min(EXPORT_PAGE_SIZE, cap - messages.length),
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

  return {
    messages,
    totalMessageCount,
    exportedMessageCount: messages.length,
    truncated,
  };
};
