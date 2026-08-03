import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  return useQuery({
    queryKey: [BASE_KEY, "conversations", filters],
    queryFn: () => getWhatsappConversations(filters),
    enabled: canFetch,
  });
}

export function useWhatsappConversation(conversationId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));

  return useQuery({
    queryKey: [BASE_KEY, "conversation", conversationId],
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

  return useQuery({
    queryKey: [BASE_KEY, "conversation-messages", conversationId, filters],
    queryFn: () => getWhatsappConversationMessages(conversationId!, filters),
    enabled: canFetch,
  });
}

export function useWhatsappConversationProviderEvents(
  conversationId: string | undefined,
  enabled = true,
) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(conversationId));

  return useQuery({
    queryKey: [BASE_KEY, "conversation-provider-events", conversationId],
    queryFn: () => getWhatsappConversationProviderEvents(conversationId!),
    enabled: canFetch,
  });
}

export function useWhatsappMessage(messageId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(messageId));

  return useQuery({
    queryKey: [BASE_KEY, "message", messageId],
    queryFn: () => getWhatsappMessageById(messageId!),
    enabled: canFetch,
  });
}

export function useWhatsappFlowExecution(flowExecutionId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(flowExecutionId));

  return useQuery({
    queryKey: [BASE_KEY, "flow", flowExecutionId],
    queryFn: () => getWhatsappFlowExecutionById(flowExecutionId!),
    enabled: canFetch,
  });
}

export function useWhatsappErrors(filters: WhatsappErrorFilters = {}, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled);

  return useQuery({
    queryKey: [BASE_KEY, "errors", filters],
    queryFn: () => getWhatsappErrors(filters),
    enabled: canFetch,
  });
}

export function useWhatsappErrorDetail(errorCode: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(errorCode));

  return useQuery({
    queryKey: [BASE_KEY, "error", errorCode],
    queryFn: () => getWhatsappErrorByCode(errorCode!),
    enabled: canFetch,
  });
}

export function useWhatsappNotification(notificationId: string | undefined, enabled = true) {
  const canFetch = usePlatformObservabilityEnabled(enabled && Boolean(notificationId));

  return useQuery({
    queryKey: [BASE_KEY, "notification", notificationId],
    queryFn: () => getWhatsappNotificationById(notificationId!),
    enabled: canFetch,
  });
}

export function useRevealWhatsappPhone(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => revealWhatsappConversationPhone(conversationId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, "conversation", conversationId] });
    },
  });
}
