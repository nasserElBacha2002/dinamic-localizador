/** Shared WhatsApp observability message-list contract (must stay ≤ backend Zod max). */
export const WHATSAPP_MESSAGES_DEFAULT_LIMIT = 50;
export const WHATSAPP_MESSAGES_MAX_LIMIT = 100;

export interface WhatsappMessagesCursor {
  createdAt: string;
  id: string;
}

export interface WhatsappMessagesMeta {
  limit: number;
  hasMore: boolean;
  nextCursor: WhatsappMessagesCursor | null;
}

export interface WhatsappConversationMessagesResponse<T> {
  data: T[];
  meta: WhatsappMessagesMeta;
}

export function normalizeWhatsappMessagesLimit(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return WHATSAPP_MESSAGES_DEFAULT_LIMIT;
  }
  const truncated = Math.trunc(value);
  return Math.min(Math.max(truncated, 1), WHATSAPP_MESSAGES_MAX_LIMIT);
}
