import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WHATSAPP_MESSAGES_DEFAULT_LIMIT,
  type WhatsappMessagesCursor,
} from "../api/contracts/whatsapp-observability";
import { getActiveCompanyId } from "../api/company-path";
import {
  getWhatsappConversationById,
  getWhatsappConversationMessages,
  getWhatsappConversationProviderEvents,
  getWhatsappConversations,
  getWhatsappErrorByCode,
  getWhatsappErrors,
  getWhatsappFlowExecutionById,
  getWhatsappMessageById,
  getWhatsappNotificationById,
  revealWhatsappConversationPhone,
} from "../api/whatsapp-observability.api";
import type {
  WhatsappConversationFilters,
  WhatsappErrorFilters,
  WhatsappObservabilityMessage,
} from "../types/whatsapp-observability";
import { useAuth } from "./useAuth";

const BASE_KEY = "whatsapp-observability";

function usePlatformObservabilityEnabled(enabled = true) {
  const { user } = useAuth();
  return enabled && Boolean(user?.isPlatformAdmin);
}

export function useWhatsappConversations(
  filters: WhatsappConversationFilters = {},
  enabled = true,
) {
  const canFetch = usePlatformObservabilityEnabled(enabled);
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "conversations", companyId, filters],
    queryFn: () => getWhatsappConversations(filters),
    enabled: canFetch,
  });
}

export function useWhatsappConversation(conversationId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "conversation", companyId, conversationId],
    queryFn: () => getWhatsappConversationById(conversationId!),
    enabled: canFetch,
  });
}

/**
 * Loads newest message window first, then older windows via cursor (`nextCursor`).
 * Pages are merged oldest→newest without duplicates.
 */
export function useWhatsappConversationMessagesInfinite(
  conversationId: string | undefined,
  enabled = true,
  limit: number = WHATSAPP_MESSAGES_DEFAULT_LIMIT,
) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));
  const companyId = getActiveCompanyId();

  return useInfiniteQuery({
    queryKey: [BASE_KEY, "conversation-messages-infinite", companyId, conversationId, limit],
    queryFn: ({ pageParam }) =>
      getWhatsappConversationMessages(conversationId!, {
        limit,
        cursor: pageParam,
      }),
    initialPageParam: null as WhatsappMessagesCursor | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.meta.hasMore || !lastPage.meta.nextCursor) {
        return undefined;
      }
      return lastPage.meta.nextCursor;
    },
    enabled: canFetch,
    select: (data) => {
      const byId = new Map<string, WhatsappObservabilityMessage>();
      // pages[0] = newest window; pages[n] = older. Flatten older-first for chrono ASC.
      for (const page of [...data.pages].reverse()) {
        for (const message of page.data) {
          byId.set(message.id, message);
        }
      }
      const messages = Array.from(byId.values());
      const firstMeta = data.pages[0]?.meta;
      return {
        messages,
        meta: firstMeta,
        loadedCount: messages.length,
      };
    },
  });
}

export function useWhatsappConversationProviderEvents(
  conversationId: string | undefined,
  enabled = true,
) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "conversation-provider-events", companyId, conversationId],
    queryFn: () => getWhatsappConversationProviderEvents(conversationId!),
    enabled: canFetch,
  });
}

export function useWhatsappMessage(messageId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(messageId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "message", companyId, messageId],
    queryFn: () => getWhatsappMessageById(messageId!),
    enabled: canFetch,
  });
}

export function useWhatsappFlowExecution(flowExecutionId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(flowExecutionId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "flow", companyId, flowExecutionId],
    queryFn: () => getWhatsappFlowExecutionById(flowExecutionId!),
    enabled: canFetch,
  });
}

export function useWhatsappErrors(filters: WhatsappErrorFilters = {}, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled);
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "errors", companyId, filters],
    queryFn: () => getWhatsappErrors(filters),
    enabled: canFetch,
  });
}

export function useWhatsappErrorDetail(errorCode: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(errorCode));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "error", companyId, errorCode],
    queryFn: () => getWhatsappErrorByCode(errorCode!),
    enabled: canFetch,
  });
}

export function useWhatsappNotification(notificationId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(notificationId));
  const companyId = getActiveCompanyId();

  return useQuery({
    queryKey: [BASE_KEY, "notification", companyId, notificationId],
    queryFn: () => getWhatsappNotificationById(notificationId!),
    enabled: canFetch,
  });
}

export function useRevealWhatsappPhone(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: () => revealWhatsappConversationPhone(conversationId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [BASE_KEY, "conversation", companyId, conversationId],
      });
    },
  });
}
