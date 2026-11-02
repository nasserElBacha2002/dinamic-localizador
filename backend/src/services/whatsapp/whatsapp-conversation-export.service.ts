import { AppError } from "../../errors/app-error";
import { whatsappObservabilityRepository } from "../../repositories/whatsapp/whatsapp-observability.repository";
import { whatsappFlowExecutionRepository } from "../../repositories/whatsapp/whatsapp-flow-execution.repository";
import { whatsappProviderEventRepository } from "../../repositories/whatsapp/whatsapp-provider-event.repository";
import { mapMessageToObservabilityDto } from "../../utils/whatsapp/whatsapp-observability-message-dto";
import {
  renderWhatsappConversationExportHtml,
  type WhatsappConversationExportDocument,
} from "../../utils/whatsapp/whatsapp-conversation-export-html";
import { whatsappObservabilityService } from "./whatsapp-observability.service";
import { loadConversationMessagesForExport } from "./whatsapp-conversation-export-messages";

const collectRequestIds = (metadataJson: string | null): string[] => {
  if (!metadataJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    const ids: string[] = [];
    for (const key of ["absenceRequestId", "requestId", "replacementRequestId"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0) {
        ids.push(value);
      }
    }
    return ids;
  } catch {
    return [];
  }
};

export const whatsappConversationExportService = {
  async buildDocument(conversationId: string, userId: string): Promise<WhatsappConversationExportDocument> {
    whatsappObservabilityService.assertUiEnabled();
    const detail = await whatsappObservabilityRepository.getConversationDetail(conversationId);
    if (!detail) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversación no encontrada.");
    }

    const messageLoad = await loadConversationMessagesForExport(conversationId);
    const messages = messageLoad.messages.map((message) => {
      const dto = mapMessageToObservabilityDto(message);
      return {
        id: dto.id,
        createdAt: dto.createdAt,
        direction: dto.direction,
        body: dto.body ?? null,
        providerStatus: dto.providerStatus ?? null,
        messageSid: dto.messageSid ?? dto.providerMessageSid ?? null,
        errorCode: dto.providerErrorCode ?? dto.processingErrorCode ?? null,
        errorMessage: dto.providerErrorMessage ?? null,
      };
    });

    const executionSummaries = await whatsappFlowExecutionRepository.listByConversation(conversationId);
    const executions = await Promise.all(
      executionSummaries.map(async (summary) => {
        const full = await whatsappFlowExecutionRepository.findById(summary.id);
        let intent: string | null = null;
        if (full?.metadataJson) {
          try {
            const meta = JSON.parse(full.metadataJson) as { intent?: unknown };
            intent = typeof meta.intent === "string" ? meta.intent : null;
          } catch {
            intent = null;
          }
        }
        return {
          id: summary.id,
          flowType: summary.flowType,
          intent,
          status: summary.status,
          resultCode: summary.resultCode ?? null,
          startedAt: summary.startedAt,
          finishedAt: summary.finishedAt ?? null,
          durationMs: summary.durationMs ?? null,
          errorCode: summary.errorCode ?? full?.errorCode ?? null,
          errorMessage: full?.errorMessage ?? null,
          metadataJson: full?.metadataJson ?? null,
        };
      }),
    );

    const providerEvents = (await whatsappProviderEventRepository.listByConversation(conversationId)).map(
      (event) => ({
        messageSid: event.providerMessageSid ?? null,
        direction: null,
        providerStatus: event.providerStatus,
        eventType: event.eventType,
        receivedAt: event.receivedAt,
        errorCode: event.errorCode ?? null,
        errorMessage: event.errorMessage ?? null,
      }),
    );

    const requestIds = [
      ...new Set(executions.flatMap((execution) => collectRequestIds(execution.metadataJson))),
    ];

    const document: WhatsappConversationExportDocument = {
      exportedAt: new Date().toISOString(),
      header: {
        conversationId: detail.id,
        phoneMasked: detail.phoneMasked,
        companyId: detail.companyId,
        employeeId: detail.employeeId,
        status: detail.status,
        startedAt: detail.startedAt,
        lastActivityAt: detail.lastActivityAt,
        messageCount: detail.messageCount,
        errorCount: detail.errorCount,
        lastResultCode: detail.lastResultCode ?? null,
        lastFlowType: detail.lastFlowType ?? null,
      },
      messages,
      executions,
      providerEvents,
      technicalIds: {
        conversationId: detail.id,
        employeeId: detail.employeeId,
        companyId: detail.companyId,
        messageIds: messages.map((message) => message.id),
        flowExecutionIds: executions.map((execution) => execution.id),
        requestIds,
      },
      exportMeta: {
        totalMessageCount: messageLoad.totalMessageCount,
        exportedMessageCount: messageLoad.exportedMessageCount,
        truncated: messageLoad.truncated,
      },
    };

    await whatsappObservabilityService.auditExport(conversationId, userId, detail.companyId, {
      messageCount: messages.length,
      executionCount: executions.length,
      truncated: messageLoad.truncated,
      totalMessageCount: messageLoad.totalMessageCount,
    });

    return document;
  },

  async exportJson(conversationId: string, userId: string): Promise<WhatsappConversationExportDocument> {
    return this.buildDocument(conversationId, userId);
  },

  async exportHtml(conversationId: string, userId: string): Promise<string> {
    const document = await this.buildDocument(conversationId, userId);
    return renderWhatsappConversationExportHtml(document);
  },
};
