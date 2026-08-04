import { AppError } from "../errors/app-error";
import { env } from "../config/env";
import { auditService } from "./audit.service";
import { whatsappObservabilityRepository } from "../repositories/whatsapp-observability.repository";
import { whatsappFlowTraceService } from "./whatsapp-flow-trace.service";
import { mapMessageToObservabilityDto } from "../utils/whatsapp-observability-message-dto";
import { whatsappProviderEventRepository } from "../repositories/whatsapp-provider-event.repository";
import type { ObservabilityListMessagesQuery } from "../schemas/whatsapp-observability.schema";

const clampLimit = (limit: number | undefined): number =>
  Math.min(Math.max(limit ?? 20, 1), 100);

const clampPage = (page: number | undefined): number => Math.max(page ?? 1, 1);

const auditObservabilityAccess = async (input: {
  companyId: string | null;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  newData?: Record<string, unknown> | null;
}): Promise<void> => {
  try {
    if (!input.companyId) {
      console.info("[whatsapp-observability-audit]", {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        companyId: null,
      });
      return;
    }
    await auditService.log(input.companyId, {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId,
      newData: input.newData ?? null,
    });
  } catch (error) {
    console.warn("[whatsapp-observability-audit] failed (non-blocking)", {
      action: input.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const whatsappObservabilityService = {
  assertUiEnabled(): void {
    if (env.WHATSAPP_OBSERVABILITY_UI_ENABLED === false) {
      throw new AppError(404, "OBSERVABILITY_UI_DISABLED", "Observabilidad deshabilitada.");
    }
  },

  async listConversations(filters: {
    companyId?: string;
    employeeId?: string;
    phone?: string;
    from?: string;
    to?: string;
    flowType?: string;
    resultCode?: string;
    status?: string;
    hasError?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    this.assertUiEnabled();
    const page = clampPage(filters.page);
    const limit = clampLimit(filters.limit);
    const result = await whatsappObservabilityRepository.listConversations({
      ...filters,
      page,
      limit,
    });
    return {
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    };
  },

  async getConversation(conversationId: string, userId: string) {
    this.assertUiEnabled();
    const detail = await whatsappObservabilityRepository.getConversationDetail(conversationId);
    if (!detail) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversación no encontrada.");
    }
    await auditObservabilityAccess({
      companyId: detail.companyId,
      userId,
      entityType: "whatsapp_conversation",
      entityId: conversationId,
      action: "OBSERVABILITY_VIEW",
      newData: { conversationId },
    });
    return detail;
  },

  async revealPhone(conversationId: string, userId: string, requestMeta?: Record<string, unknown>) {
    this.assertUiEnabled();
    const stored = await whatsappObservabilityRepository.revealPhone(conversationId);
    if (!stored) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversación no encontrada.");
    }
    const phone = whatsappFlowTraceService.decryptStoredPhone(stored);
    if (!phone) {
      throw new AppError(404, "PHONE_UNAVAILABLE", "No se pudo revelar el teléfono.");
    }
    const detail = await whatsappObservabilityRepository.getConversationDetail(conversationId);
    await auditObservabilityAccess({
      companyId: detail?.companyId ?? null,
      userId,
      entityType: "whatsapp_conversation",
      entityId: conversationId,
      action: "OBSERVABILITY_REVEAL_PHONE",
      newData: { revealed: true, meta: requestMeta ?? null },
    });
    return { phoneNormalized: phone };
  },

  async listMessages(conversationId: string, query: ObservabilityListMessagesQuery) {
    this.assertUiEnabled();
    const detail = await whatsappObservabilityRepository.getConversationDetail(conversationId);
    if (!detail) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversación no encontrada.");
    }
    const result = await whatsappObservabilityRepository.listMessages(conversationId, {
      limit: query.limit,
      beforeCreatedAt: query.beforeCreatedAt,
      beforeId: query.beforeId,
      direction: query.direction,
    });
    return {
      data: result.data.map((message) => mapMessageToObservabilityDto(message)),
      meta: {
        limit: query.limit,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    };
  },

  async listProviderEvents(conversationId: string, userId: string) {
    this.assertUiEnabled();
    const detail = await whatsappObservabilityRepository.getConversationDetail(conversationId);
    if (!detail) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversación no encontrada.");
    }
    await auditObservabilityAccess({
      companyId: detail.companyId,
      userId,
      entityType: "whatsapp_conversation",
      entityId: conversationId,
      action: "OBSERVABILITY_VIEW_PROVIDER_EVENTS",
    });
    return whatsappProviderEventRepository.listByConversation(conversationId);
  },

  async getMessage(messageId: string, userId: string) {
    this.assertUiEnabled();
    const message = await whatsappObservabilityRepository.getMessageDetail(messageId);
    if (!message) {
      throw new AppError(404, "MESSAGE_NOT_FOUND", "Mensaje no encontrado.");
    }
    await auditObservabilityAccess({
      companyId: null,
      userId,
      entityType: "whatsapp_message",
      entityId: messageId,
      action: "OBSERVABILITY_VIEW_MESSAGE",
    });
    return mapMessageToObservabilityDto(message, {
      providerEvents: message.providerEvents,
    });
  },

  async getFlow(flowExecutionId: string, userId: string) {
    this.assertUiEnabled();
    const detail = await whatsappObservabilityRepository.getFlowExecutionDetail(flowExecutionId);
    if (!detail) {
      throw new AppError(404, "FLOW_NOT_FOUND", "Ejecución no encontrada.");
    }
    await auditObservabilityAccess({
      companyId: detail.companyId,
      userId,
      entityType: "whatsapp_flow_execution",
      entityId: flowExecutionId,
      action: "OBSERVABILITY_VIEW_FLOW",
    });
    return detail;
  },

  async listErrors(filters: {
    companyId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    this.assertUiEnabled();
    const page = clampPage(filters.page);
    const limit = clampLimit(filters.limit);
    const result = await whatsappObservabilityRepository.listErrors({
      ...filters,
      page,
      limit,
    });
    return {
      data: result.data,
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    };
  },

  async getError(errorCode: string) {
    this.assertUiEnabled();
    return whatsappObservabilityRepository.getErrorDetail(errorCode);
  },

  async getNotification(notificationId: string, userId: string) {
    this.assertUiEnabled();
    const detail = await whatsappObservabilityRepository.getNotificationDetail(notificationId);
    if (!detail) {
      throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notificación no encontrada.");
    }
    await auditObservabilityAccess({
      companyId: detail.companyId,
      userId,
      entityType: "whatsapp_attendance_notification",
      entityId: notificationId,
      action: "OBSERVABILITY_VIEW_NOTIFICATION",
    });
    return detail;
  },

  async runCleanupBatch(): Promise<Record<string, number>> {
    if (!env.WHATSAPP_OBSERVABILITY_CLEANUP_JOB_ENABLED) {
      return { skipped: 1 };
    }
    return whatsappObservabilityRepository.cleanupObservabilityBatches({
      messageRetentionDays: env.WHATSAPP_OBSERVABILITY_TEMPLATE_VARS_RETENTION_DAYS,
      flowRetentionDays: env.WHATSAPP_OBSERVABILITY_FLOW_RETENTION_DAYS,
      candidateRetentionDays: env.WHATSAPP_OBSERVABILITY_CANDIDATE_RETENTION_DAYS,
      providerEventRetentionDays: env.WHATSAPP_OBSERVABILITY_PROVIDER_EVENT_RETENTION_DAYS,
      batchSize: 200,
    });
  },
};
