import type {
  OperationAssignmentNotificationStatus,
  OperationAssignmentNotificationType,
  OperationAssignmentSendAttemptStatus,
} from "../constants/operation-assignment-notification";

export type OperationAssignmentNotification = {
  id: string;
  companyId: string;
  operationAssignmentId: string;
  operationId: string;
  employeeId: string;
  notificationType: OperationAssignmentNotificationType;
  status: OperationAssignmentNotificationStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerMessageSid: string | null;
  providerStatus: string | null;
  cancelRequestedAt: string | null;
  activeSendAttemptId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationAssignmentNotificationSendAttempt = {
  id: string;
  companyId: string;
  notificationId: string;
  attemptNumber: number;
  status: OperationAssignmentSendAttemptStatus;
  providerMessageSid: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
