import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  RevealPhoneResult,
  WhatsappConversationDetail,
  WhatsappConversationFilters,
  WhatsappConversationSummary,
  WhatsappErrorDetail,
  WhatsappErrorAggregation,
  WhatsappErrorFilters,
  WhatsappFlowExecutionDetail,
  WhatsappNotificationDetail,
  WhatsappObservabilityMessage,
  WhatsappProviderEvent,
} from "../types/whatsapp-observability";
import {
  normalizeWhatsappMessagesLimit,
  type WhatsappConversationMessagesResponse,
  type WhatsappMessagesCursor,
} from "./contracts/whatsapp-observability";
import { apiClient, buildParams } from "./client";

export async function getWhatsappConversations(
  filters: WhatsappConversationFilters = {},
): Promise<PaginatedResponse<WhatsappConversationSummary>> {
  const { data } = await apiClient.get<PaginatedResponse<WhatsappConversationSummary>>(
    "platform/observability/whatsapp/conversations",
    {
      params: buildParams(filters as Record<string, string | number | boolean | string[] | undefined>),
    },
  );
  return data;
}

export async function getWhatsappObservabilityEmployeeLookups(
  query: {
    search?: string;
    limit?: number;
    id?: string;
    ids?: string[];
    active?: boolean;
  } = {},
  options?: { signal?: AbortSignal },
): Promise<
  Array<{ id: string; fullName: string; companyId: string; companyName: string }>
> {
  const { data } = await apiClient.get<{
    data: Array<{ id: string; fullName: string; companyId: string; companyName: string }>;
  }>("platform/observability/whatsapp/employee-lookups", {
    params: buildParams({
      search: query.search,
      limit: query.limit,
      id: query.id,
      ids: query.ids,
      active: query.active,
    }),
    signal: options?.signal,
  });
  return data.data;
}

export async function getWhatsappConversationById(
  conversationId: string,
): Promise<WhatsappConversationDetail> {
  const { data } = await apiClient.get<SingleResponse<WhatsappConversationDetail>>(
    `platform/observability/whatsapp/conversations/${conversationId}`,
  );
  return data.data;
}

export async function getWhatsappConversationMessages(
  conversationId: string,
  filters: {
    limit?: number;
    beforeCreatedAt?: string;
    beforeId?: string;
    direction?: string;
    cursor?: WhatsappMessagesCursor | null;
  } = {},
): Promise<WhatsappConversationMessagesResponse<WhatsappObservabilityMessage>> {
  const cursor = filters.cursor ?? null;
  const params = buildParams({
    limit: normalizeWhatsappMessagesLimit(filters.limit),
    beforeCreatedAt: filters.beforeCreatedAt ?? cursor?.createdAt,
    beforeId: filters.beforeId ?? cursor?.id,
    direction: filters.direction,
  });
  const { data } = await apiClient.get<
    WhatsappConversationMessagesResponse<WhatsappObservabilityMessage>
  >(`platform/observability/whatsapp/conversations/${conversationId}/messages`, {
    params,
  });
  return data;
}

export async function getWhatsappMessageById(
  messageId: string,
): Promise<WhatsappObservabilityMessage> {
  const { data } = await apiClient.get<SingleResponse<WhatsappObservabilityMessage>>(
    `platform/observability/whatsapp/messages/${messageId}`,
  );
  return data.data;
}

export async function getWhatsappFlowExecutionById(
  flowExecutionId: string,
): Promise<WhatsappFlowExecutionDetail> {
  const { data } = await apiClient.get<SingleResponse<WhatsappFlowExecutionDetail>>(
    `platform/observability/whatsapp/flows/${flowExecutionId}`,
  );
  return data.data;
}

export async function getWhatsappErrors(
  filters: WhatsappErrorFilters = {},
): Promise<PaginatedResponse<WhatsappErrorAggregation>> {
  const { data } = await apiClient.get<PaginatedResponse<WhatsappErrorAggregation>>(
    "platform/observability/whatsapp/errors",
    {
      params: buildParams(filters as Record<string, string | number | boolean | string[] | undefined>),
    },
  );
  return data;
}

export async function getWhatsappErrorByCode(errorCode: string): Promise<WhatsappErrorDetail> {
  const { data } = await apiClient.get<SingleResponse<WhatsappErrorDetail>>(
    `platform/observability/whatsapp/errors/${encodeURIComponent(errorCode)}`,
  );
  return data.data;
}

export async function getWhatsappNotificationById(
  notificationId: string,
): Promise<WhatsappNotificationDetail> {
  const { data } = await apiClient.get<SingleResponse<WhatsappNotificationDetail>>(
    `platform/observability/whatsapp/notifications/${notificationId}`,
  );
  return data.data;
}

export async function getWhatsappConversationProviderEvents(
  conversationId: string,
): Promise<WhatsappProviderEvent[]> {
  const { data } = await apiClient.get<SingleResponse<WhatsappProviderEvent[]>>(
    `platform/observability/whatsapp/conversations/${conversationId}/provider-events`,
  );
  return data.data;
}

export async function revealWhatsappConversationPhone(
  conversationId: string,
): Promise<RevealPhoneResult> {
  const { data } = await apiClient.post<SingleResponse<RevealPhoneResult>>(
    `platform/observability/whatsapp/conversations/${conversationId}/reveal-phone`,
  );
  return data.data;
}
