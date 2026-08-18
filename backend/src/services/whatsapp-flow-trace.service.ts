import { env } from "../config/env";
import {
  WHATSAPP_PROVIDER_STATUS_RANK,
  type WhatsappConversationStatus,
  type WhatsappFlowExecutionStatus,
  type WhatsappFlowStepStatus,
  type WhatsappFlowStepType,
} from "../constants/whatsapp-observability";
import { attendanceNotificationRepository } from "../repositories/attendance-notification.repository";
import { operationAssignmentNotificationRepository } from "../repositories/operation-assignment-notification.repository";
import { payrollReceiptNotificationRepository } from "../repositories/payroll-receipt-notification.repository";
import { whatsappConversationRepository } from "../repositories/whatsapp-conversation.repository";
import { whatsappFlowExecutionRepository } from "../repositories/whatsapp-flow-execution.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import { whatsappProviderEventRepository } from "../repositories/whatsapp-provider-event.repository";
import type { WhatsappConversation, WhatsappFlowExecution } from "../types/whatsapp-observability";
import {
  buildProviderEventKey,
  createCorrelationId,
  hashPhoneForObservability,
  maskPhoneForObservability,
  pickProjectedProviderStatus,
  sanitizeObservabilityPayload,
  truncateJson,
} from "../utils/whatsapp-observability";
import {
  decryptPhoneForObservability,
  encryptPhoneForObservability,
} from "../utils/whatsapp-observability-phone-crypto";

const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[whatsapp-observability] ${label} failed (non-blocking)`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export interface FlowTraceHandle {
  executionId: string;
  correlationId: string;
  conversationId: string | null;
  addStep: (input: {
    stepType: WhatsappFlowStepType | string;
    stepName?: string;
    status: WhatsappFlowStepStatus;
    reasonCode?: string | null;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    durationMs?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) => Promise<void>;
  addCandidate: (input: {
    candidateType: string;
    entityId?: string | null;
    companyId?: string | null;
    accepted: boolean;
    reasonCode?: string | null;
    reasonDetail?: string | null;
    snapshot?: Record<string, unknown> | null;
  }) => Promise<void>;
  addCandidates: (
    items: Array<{
      candidateType: string;
      entityId?: string | null;
      companyId?: string | null;
      accepted: boolean;
      reasonCode?: string | null;
      reasonDetail?: string | null;
      snapshot?: Record<string, unknown> | null;
    }>,
  ) => Promise<void>;
  complete: (input: {
    status?: WhatsappFlowExecutionStatus;
    resultCode?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    sessionId?: string | null;
    attendanceId?: string | null;
    operationId?: string | null;
    workdayId?: string | null;
    employeeId?: string | null;
    sourceMessageId?: string | null;
    conversationStatus?: WhatsappConversationStatus;
  }) => Promise<void>;
}

const phoneSecret = (): string => env.WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET;

export const whatsappFlowTraceService = {
  isEnabled(): boolean {
    return env.WHATSAPP_OBSERVABILITY_ENABLED !== false;
  },

  decryptStoredPhone(stored: string): string | null {
    return decryptPhoneForObservability(stored, phoneSecret());
  },

  async resolveOrCreateConversation(input: {
    phoneNormalized: string;
    companyId: string | null;
    employeeId?: string | null;
  }): Promise<WhatsappConversation | null> {
    if (!this.isEnabled()) {
      return null;
    }

    return safe("resolveOrCreateConversation", async () => {
      const secret = phoneSecret();
      const phoneHash = hashPhoneForObservability(input.phoneNormalized, secret);
      return whatsappConversationRepository.resolveOrCreateOpen({
        companyId: input.companyId,
        employeeId: input.employeeId ?? null,
        phoneHash,
        phoneMasked: maskPhoneForObservability(input.phoneNormalized),
        phoneNormalizedEncrypted: encryptPhoneForObservability(input.phoneNormalized, secret),
      });
    });
  },

  async recordBlockedCompanyResolution(input: {
    phoneNormalized: string;
    messageSid: string;
    reason: string;
    resultCode: string;
    responsePreview: string;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    await safe("recordBlockedCompanyResolution", async () => {
      const conversation = await this.resolveOrCreateConversation({
        phoneNormalized: input.phoneNormalized,
        companyId: null,
      });
      const trace = await this.startExecution({
        conversationId: conversation?.id ?? null,
        companyId: null,
        flowType: "COMPANY_RESOLUTION",
        metadata: { messageSid: input.messageSid, reason: input.reason },
      });
      if (!trace) {
        return;
      }
      await trace.addStep({
        stepType: "COMPANY_RESOLUTION",
        status: "REJECTED",
        reasonCode: input.resultCode,
        output: { reason: input.reason, responsePreview: input.responsePreview },
      });
      await trace.complete({
        status: "COMPLETED",
        resultCode: input.resultCode,
        conversationStatus: "WARNING",
      });
    });
  },

  async startExecution(input: {
    conversationId?: string | null;
    sourceMessageId?: string | null;
    correlationId?: string;
    causationId?: string | null;
    sessionId?: string | null;
    notificationId?: string | null;
    companyId?: string | null;
    employeeId?: string | null;
    operationId?: string | null;
    workdayId?: string | null;
    attendanceId?: string | null;
    flowType: string;
    flowVersion?: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<FlowTraceHandle | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const correlationId = input.correlationId ?? createCorrelationId();
    const execution = await safe("startExecution", async () =>
      whatsappFlowExecutionRepository.create({
        conversationId: input.conversationId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        correlationId,
        causationId: input.causationId ?? null,
        sessionId: input.sessionId ?? null,
        notificationId: input.notificationId ?? null,
        companyId: input.companyId ?? null,
        employeeId: input.employeeId ?? null,
        operationId: input.operationId ?? null,
        workdayId: input.workdayId ?? null,
        attendanceId: input.attendanceId ?? null,
        flowType: input.flowType,
        flowVersion: input.flowVersion ?? "1",
        metadataJson: sanitizeObservabilityPayload(input.metadata ?? null),
      }),
    );

    if (!execution) {
      return null;
    }

    let stepSequence = 0;
    let candidateSequence = 0;
    const pendingSteps: Parameters<typeof whatsappFlowExecutionRepository.insertSteps>[0] = [];
    const pendingCandidates: Parameters<
      typeof whatsappFlowExecutionRepository.insertCandidates
    >[0] = [];

    const flushSteps = async () => {
      if (pendingSteps.length === 0) {
        return;
      }
      const batch = pendingSteps.splice(0, pendingSteps.length);
      await safe("flushSteps", () => whatsappFlowExecutionRepository.insertSteps(batch));
    };

    const flushCandidates = async () => {
      if (pendingCandidates.length === 0) {
        return;
      }
      const batch = pendingCandidates.splice(0, pendingCandidates.length);
      await safe("flushCandidates", () =>
        whatsappFlowExecutionRepository.insertCandidates(batch),
      );
    };

    const handle: FlowTraceHandle = {
      executionId: execution.id,
      correlationId,
      conversationId: execution.conversationId,
      async addStep(stepInput) {
        stepSequence += 1;
        pendingSteps.push({
          flowExecutionId: execution.id,
          sequence: stepSequence,
          stepType: stepInput.stepType,
          stepName: stepInput.stepName ?? String(stepInput.stepType),
          status: stepInput.status,
          reasonCode: stepInput.reasonCode ?? null,
          inputSummaryJson: sanitizeObservabilityPayload(stepInput.input ?? null),
          outputSummaryJson: sanitizeObservabilityPayload(stepInput.output ?? null),
          durationMs: stepInput.durationMs ?? null,
          errorCode: stepInput.errorCode ?? null,
          errorMessage: stepInput.errorMessage
            ? stepInput.errorMessage.slice(0, 500)
            : null,
        });
        if (pendingSteps.length >= 8) {
          await flushSteps();
        }
      },
      async addCandidate(candidateInput) {
        await handle.addCandidates([candidateInput]);
      },
      async addCandidates(items) {
        for (const item of items) {
          candidateSequence += 1;
          pendingCandidates.push({
            flowExecutionId: execution.id,
            candidateType: item.candidateType,
            entityId: item.entityId ?? null,
            companyId: item.companyId ?? null,
            accepted: item.accepted,
            reasonCode: item.reasonCode ?? null,
            reasonDetail: item.reasonDetail ? item.reasonDetail.slice(0, 500) : null,
            candidateSnapshotJson: sanitizeObservabilityPayload(item.snapshot ?? null),
            sequence: candidateSequence,
          });
        }
        if (pendingCandidates.length >= 20) {
          await flushCandidates();
        }
      },
      async complete(completeInput) {
        await flushSteps();
        await flushCandidates();

        const status = completeInput.status ?? "COMPLETED";
        await safe("completeExecution", () =>
          whatsappFlowExecutionRepository.complete({
            id: execution.id,
            status,
            resultCode: completeInput.resultCode ?? null,
            errorCode: completeInput.errorCode ?? null,
            errorMessage: completeInput.errorMessage
              ? completeInput.errorMessage.slice(0, 500)
              : null,
            sessionId: completeInput.sessionId ?? null,
            attendanceId: completeInput.attendanceId ?? null,
            operationId: completeInput.operationId ?? null,
            workdayId: completeInput.workdayId ?? null,
            employeeId: completeInput.employeeId ?? null,
            sourceMessageId: completeInput.sourceMessageId ?? null,
          }),
        );

        if (execution.conversationId) {
          const isError = status === "FAILED" || Boolean(completeInput.errorCode);
          await safe("touchConversation", () =>
            whatsappConversationRepository.touch({
              conversationId: execution.conversationId!,
              employeeId: completeInput.employeeId ?? null,
              lastFlowType: execution.flowType,
              lastResultCode: completeInput.resultCode ?? null,
              status:
                completeInput.conversationStatus ??
                (isError ? "ERROR" : status === "COMPLETED" ? "ACTIVE" : "WARNING"),
              incrementError: isError,
            }),
          );
        }
      },
    };

    return handle;
  },

  async linkMessageObservability(input: {
    messageId: string;
    companyId?: string;
    conversationId?: string | null;
    correlationId?: string | null;
    causationId?: string | null;
    provider?: string | null;
    providerMessageSid?: string | null;
    templateSid?: string | null;
    templateName?: string | null;
    templateVariables?: Record<string, unknown> | null;
    providerStatus?: string | null;
    notificationId?: string | null;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const message = input.companyId
      ? await whatsappMessageRepository.findById(input.companyId, input.messageId)
      : await whatsappMessageRepository.findByIdGlobal(input.messageId);
    if (!message) {
      return;
    }

    await safe("linkMessageObservability", () =>
      whatsappMessageRepository.updateObservabilityFields(message.companyId, input.messageId, {
        conversationId: input.conversationId ?? null,
        correlationId: input.correlationId ?? null,
        causationId: input.causationId ?? null,
        provider: input.provider ?? "TWILIO",
        providerMessageSid: input.providerMessageSid ?? null,
        templateSid: input.templateSid ?? null,
        templateName: input.templateName ?? null,
        templateVariablesJson: truncateJson(input.templateVariables, 2000),
        providerStatus: input.providerStatus ?? null,
        notificationId: input.notificationId ?? null,
      }),
    );

    if (input.providerMessageSid) {
      await safe("linkPendingProviderEvents", () =>
        this.linkPendingProviderEvents(input.providerMessageSid!, input.messageId),
      );
    }

    if (input.conversationId) {
      await safe("incrementMessageCount", () =>
        whatsappConversationRepository.touch({
          conversationId: input.conversationId!,
          incrementMessage: true,
        }),
      );
    }
  },

  async linkPendingProviderEvents(
    providerMessageSid: string,
    messageId: string,
  ): Promise<number> {
    const linked = await whatsappProviderEventRepository.linkOrphanedToMessage(
      providerMessageSid,
      messageId,
    );
    if (linked === 0) {
      return 0;
    }

    const events = await whatsappProviderEventRepository.listByMessageSid(providerMessageSid);
    let projected: string | null = null;
    for (const event of events) {
      projected = pickProjectedProviderStatus(
        projected,
        event.providerStatus,
        WHATSAPP_PROVIDER_STATUS_RANK,
      );
    }
    const latest = events[events.length - 1];
    if (projected && latest) {
      const message = await whatsappMessageRepository.findByIdGlobal(messageId);
      if (!message) {
        return linked;
      }
      await whatsappMessageRepository.updateProviderStatus(message.companyId, messageId, {
        providerStatus: projected,
        providerErrorCode: latest.errorCode,
        providerErrorMessage: latest.errorMessage,
        statusTimestamp: new Date(latest.receivedAt),
        statusKey: projected,
      });
      await this.projectNotificationProviderStatus({
        messageId,
        providerStatus: projected,
        errorCode: latest.errorCode,
        errorMessage: latest.errorMessage,
      });
      await this.projectOutboxProviderStatusByMessageSid({
        providerMessageSid,
        providerStatus: projected,
      });
    }
    return linked;
  },

  async projectNotificationProviderStatus(input: {
    messageId: string;
    providerStatus: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const message = await whatsappMessageRepository.findByIdGlobal(input.messageId);
    if (!message?.notificationId) {
      return;
    }
    const providerStatus = input.providerStatus.toLowerCase();
    await attendanceNotificationRepository.projectProviderStatusById({
      notificationId: message.notificationId,
      providerStatus,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
    // Payroll + assignment outboxes: project provider delivery status only —
    // never promote to DELIVERED here. Prefer notificationId when known; always
    // also correlate by provider_message_sid so callbacks work if whatsapp_messages
    // failed to persist after Twilio accepted the send.
    await payrollReceiptNotificationRepository.projectProviderStatusById({
      notificationId: message.notificationId,
      providerStatus,
    });
    await operationAssignmentNotificationRepository.projectProviderStatusById({
      notificationId: message.notificationId,
      providerStatus,
    });
  },

  async projectOutboxProviderStatusByMessageSid(input: {
    providerMessageSid: string;
    providerStatus: string;
  }): Promise<void> {
    const providerStatus = input.providerStatus.toLowerCase();
    await payrollReceiptNotificationRepository.projectProviderStatusByMessageSid({
      providerMessageSid: input.providerMessageSid,
      providerStatus,
    });
    await operationAssignmentNotificationRepository.projectProviderStatusByMessageSid({
      providerMessageSid: input.providerMessageSid,
      providerStatus,
    });
  },

  async recordProviderStatus(input: {
    providerMessageSid: string;
    providerStatus: string;
    errorCode?: string | null;
    errorMessage?: string | null;
    payload?: Record<string, unknown> | null;
    providerTimestamp?: string | null;
  }): Promise<{ created: boolean; messageId: string | null }> {
    if (!this.isEnabled() && !env.WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED) {
      return { created: false, messageId: null };
    }

    const sanitized = sanitizeObservabilityPayload(input.payload ?? null);
    const providerEventKey = buildProviderEventKey({
      messageSid: input.providerMessageSid,
      status: input.providerStatus,
      errorCode: input.errorCode,
      providerTimestamp: input.providerTimestamp,
      payloadHash: sanitized ? sanitized.slice(0, 64) : null,
    });

    const message = await whatsappMessageRepository.findByProviderMessageSid(
      input.providerMessageSid,
    );

    const insertResult = await whatsappProviderEventRepository.insertIdempotent({
      messageId: message?.id ?? null,
      provider: "TWILIO",
      providerMessageSid: input.providerMessageSid,
      eventType: "STATUS",
      providerStatus: input.providerStatus.toLowerCase(),
      providerEventKey,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ? input.errorMessage.slice(0, 500) : null,
      payloadJsonSanitized: sanitized,
      providerCreatedAt: input.providerTimestamp ?? null,
    });

    if (!insertResult.created) {
      return { created: false, messageId: message?.id ?? null };
    }

    // Durable fallback: outbox rows store provider_message_sid even when
    // whatsapp_messages.create failed after Twilio accepted the send.
    await this.projectOutboxProviderStatusByMessageSid({
      providerMessageSid: input.providerMessageSid,
      providerStatus: input.providerStatus,
    });

    if (!message) {
      return { created: true, messageId: null };
    }

    const projected = pickProjectedProviderStatus(
      message.providerStatus,
      input.providerStatus,
      WHATSAPP_PROVIDER_STATUS_RANK,
    );

    await whatsappMessageRepository.updateProviderStatus(message.companyId, message.id, {
      providerStatus: projected,
      providerErrorCode: input.errorCode ?? null,
      providerErrorMessage: input.errorMessage ?? null,
      statusTimestamp: input.providerTimestamp
        ? new Date(input.providerTimestamp)
        : new Date(),
      statusKey: projected,
    });

    await this.projectNotificationProviderStatus({
      messageId: message.id,
      providerStatus: projected,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });

    return { created: true, messageId: message.id };
  },

  async getExecution(id: string): Promise<WhatsappFlowExecution | null> {
    return whatsappFlowExecutionRepository.findById(id);
  },
};
