import type { WhatsAppMessage } from "../types/twilio.types";
import { maskPhoneForObservability } from "./whatsapp-observability";

export interface ObservabilityMessageDtoOptions {
  revealPhone?: boolean;
  revealLocation?: boolean;
  revealPayload?: boolean;
  providerEvents?: unknown[];
}

/** Maps a persisted WhatsApp message to a safe observability API DTO. */
export const mapMessageToObservabilityDto = (
  message: WhatsAppMessage,
  options: ObservabilityMessageDtoOptions = {},
) => {
  const revealPhone = options.revealPhone === true;
  const revealLocation = options.revealLocation === true;
  const revealPayload = options.revealPayload === true;

  return {
    id: message.id,
    conversationId: message.conversationId ?? null,
    messageSid: message.messageSid,
    direction: message.direction,
    employeeId: message.employeeId,
    phoneFrom: revealPhone ? message.phoneFrom : maskPhoneForObservability(message.phoneFrom),
    phoneTo: revealPhone ? message.phoneTo : maskPhoneForObservability(message.phoneTo),
    messageType: message.messageType,
    body: message.body,
    latitude: revealLocation ? message.latitude : null,
    longitude: revealLocation ? message.longitude : null,
    status: message.status,
    processingStatus: message.processingStatus,
    processingErrorCode: message.processingErrorCode,
    correlationId: message.correlationId ?? null,
    causationId: message.causationId ?? null,
    provider: message.provider ?? null,
    providerMessageSid: message.providerMessageSid ?? message.messageSid,
    templateSid: message.templateSid ?? null,
    templateName: message.templateName ?? null,
    templateVariablesJson: message.templateVariablesJson ?? null,
    providerStatus: message.providerStatus ?? null,
    providerErrorCode: message.providerErrorCode ?? null,
    providerErrorMessage: message.providerErrorMessage ?? null,
    sentAt: message.sentAt ?? null,
    deliveredAt: message.deliveredAt ?? null,
    readAt: message.readAt ?? null,
    failedAt: message.failedAt ?? null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt ?? null,
    notificationId: message.notificationId ?? null,
    rawPayload: revealPayload ? message.rawPayload : undefined,
    providerEvents: options.providerEvents,
  };
};
