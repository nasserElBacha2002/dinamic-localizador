import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  WHATSAPP_CONVERSATION_MESSAGES_MAX_LIMIT,
  WHATSAPP_CONVERSATION_MESSAGES_PAGE_SIZE,
} from "../pages/platform/observability/whatsapp-observability-messages";

const BASE_KEY = "whatsapp-observability";

function usePlatformObservabilityEnabled(enabled = true) {
  const { user } = useAuth();
  return enabled && Boolean(user?.isPlatformAdmin);
}

function clampMessagesLimit(limit: number | undefined): number {
  const resolved = limit ?? WHATSAPP_CONVERSATION_MESSAGES_PAGE_SIZE;
  return Math.min(Math.max(resolved, 1), WHATSAPP_CONVERSATION_MESSAGES_MAX_LIMIT);
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

export function useWhatsappConversationMessages(
  conversationId: string | undefined,
  filters: { page?: number; limit?: number; direction?: string } = {},
  enabled = true,
) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));
  const companyId = getActiveCompanyId();
  const safeFilters = {
    ...filters,
    limit: clampMessagesLimit(filters.limit),
  };

  return useQuery({
    queryKey: [BASE_KEY, "conversation-messages", companyId, conversationId, safeFilters],
    queryFn: () => getWhatsappConversationMessages(conversationId!, safeFilters),
    enabled: canFetch,
  });
}

/**
 * Loads newest message window first (page 1 = most recent), then older pages via fetchNextPage.
 * Pages are merged oldest→newest without duplicates.
 */
export function useWhatsappConversationMessagesInfinite(
  conversationId: string | undefined,
  enabled = true,
  limit: number = WHATSAPP_CONVERSATION_MESSAGES_PAGE_SIZE,
) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));
  const companyId = getActiveCompanyId();
  const safeLimit = clampMessagesLimit(limit);

  return useInfiniteQuery({
    queryKey: [BASE_KEY, "conversation-messages-infinite", companyId, conversationId, safeLimit],
    queryFn: ({ pageParam }) =>
      getWhatsappConversationMessages(conversationId!, {
        page: pageParam,
        limit: safeLimit,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages, hasMore } = lastPage.meta;
      if (hasMore === false) {
        return undefined;
      }
      if (totalPages <= 0 || page >= totalPages) {
        return undefined;
      }
      return page + 1;
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
      const lastMeta = data.pages[data.pages.length - 1]?.meta;
      return {
        messages,
        meta: firstMeta,
        hasOlder: Boolean(
          lastMeta &&
            lastMeta.totalPages > 0 &&
            (lastMeta.hasMore ?? lastMeta.page < lastMeta.totalPages),
        ),
        loadedCount: messages.length,
        total: firstMeta?.total ?? 0,
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
