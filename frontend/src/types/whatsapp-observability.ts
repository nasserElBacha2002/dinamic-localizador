export type WhatsappConversationStatus = "ACTIVE" | "COMPLETED" | "WARNING" | "ERROR";

export type WhatsappFlowExecutionStatus =
  | "STARTED"
  | "COMPLETED"
  | "FAILED"
  | "PARTIALLY_RECORDED";

export type WhatsappFlowStepStatus =
  | "SUCCESS"
  | "SKIPPED"
  | "REJECTED"
  | "WARNING"
  | "FAILED";

export type WhatsappMessageDirection = "INBOUND" | "OUTBOUND";
export type WhatsappMessageType = "TEXT" | "LOCATION" | "UNKNOWN";

export interface WhatsappConversationSummary {
  id: string;
  companyId: string | null;
  employeeId: string | null;
  phoneMasked: string;
  startedAt: string;
  lastActivityAt: string;
  status: WhatsappConversationStatus;
  lastFlowType: string | null;
  lastResultCode: string | null;
  messageCount: number;
  errorCount: number;
}

export interface WhatsappConversationDetail extends WhatsappConversationSummary {
  phoneHash: string;
  phoneNormalized?: string | null;
  createdAt: string;
  updatedAt: string;
  recentExecutions?: WhatsappFlowExecutionSummary[];
}

export interface WhatsappFlowExecutionSummary {
  id: string;
  flowType: string;
  status: WhatsappFlowExecutionStatus;
  resultCode: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
}

export interface WhatsappFlowExecutionDetail {
  id: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  correlationId: string;
  causationId: string | null;
  sessionId: string | null;
  notificationId: string | null;
  companyId: string | null;
  employeeId: string | null;
  operationId: string | null;
  workdayId: string | null;
  attendanceId: string | null;
  flowType: string;
  flowVersion: string;
  status: WhatsappFlowExecutionStatus;
  resultCode: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadataJson: string | null;
  createdAt: string;
  steps: WhatsappFlowStep[];
  candidates: WhatsappFlowCandidate[];
}

export interface WhatsappFlowStep {
  id: string;
  flowExecutionId: string;
  sequence: number;
  stepType: string;
  stepName: string;
  status: WhatsappFlowStepStatus;
  reasonCode: string | null;
  inputSummaryJson: string | null;
  outputSummaryJson: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface WhatsappFlowCandidate {
  id: string;
  flowExecutionId: string;
  candidateType: string;
  entityId: string | null;
  companyId: string | null;
  accepted: boolean;
  reasonCode: string | null;
  reasonDetail: string | null;
  candidateSnapshotJson: string | null;
  sequence: number;
  createdAt: string;
}

export interface WhatsappObservabilityMessage {
  id: string;
  conversationId: string | null;
  messageSid: string | null;
  direction: WhatsappMessageDirection;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
  messageType: WhatsappMessageType;
  body: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  processingStatus: string | null;
  processingErrorCode: string | null;
  correlationId: string | null;
  causationId: string | null;
  provider: string | null;
  providerMessageSid: string | null;
  templateSid: string | null;
  templateName: string | null;
  templateVariablesJson: string | null;
  providerStatus: string | null;
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  notificationId: string | null;
  providerEvents?: WhatsappProviderEvent[];
}

export interface WhatsappProviderEvent {
  id: string;
  messageId: string | null;
  provider: string;
  providerMessageSid: string;
  eventType: string;
  providerStatus: string;
  providerEventKey: string;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJsonSanitized: string | null;
  providerCreatedAt: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface WhatsappErrorAggregation {
  errorCode: string;
  count: number;
  lastSeenAt: string;
  sampleConversationId: string | null;
  sampleFlowExecutionId: string | null;
}

export interface WhatsappErrorDetail {
  errorCode: string;
  count: number;
  lastSeenAt: string;
  samples: WhatsappErrorSample[];
}

export interface WhatsappErrorSample {
  flowExecutionId: string | null;
  conversationId: string | null;
  messageId: string | null;
  resultCode: string | null;
  errorMessage: string | null;
  occurredAt: string;
}

export interface WhatsappNotificationDetail {
  id: string;
  companyId: string;
  employeeId: string;
  operationWorkdayId: string | null;
  attendanceRecordId: string | null;
  phoneNumber: string;
  phoneMasked: string;
  templateSid: string | null;
  templateName: string | null;
  status: string;
  twilioMessageSid: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  correlationId: string | null;
  flowExecutionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappConversationFilters {
  companyId?: string;
  employeeId?: string;
  phone?: string;
  from?: string;
  to?: string;
  flowType?: string;
  resultCode?: string;
  status?: WhatsappConversationStatus;
  hasError?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WhatsappErrorFilters {
  from?: string;
  to?: string;
  companyId?: string;
  page?: number;
  limit?: number;
}

export interface RevealPhoneResult {
  phoneNormalized: string;
}
