import type {
  WhatsappConversationStatus,
  WhatsappFlowExecutionStatus,
  WhatsappFlowStepStatus,
  WhatsappFlowStepType,
} from "../constants/whatsapp-observability";

export interface WhatsappConversation {
  id: string;
  companyId: string | null;
  employeeId: string | null;
  phoneHash: string;
  phoneMasked: string;
  phoneNormalized: string;
  startedAt: string;
  lastActivityAt: string;
  status: WhatsappConversationStatus;
  lastFlowType: string | null;
  lastResultCode: string | null;
  messageCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappFlowExecution {
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
}

export interface WhatsappFlowStep {
  id: string;
  flowExecutionId: string;
  sequence: number;
  stepType: WhatsappFlowStepType | string;
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
