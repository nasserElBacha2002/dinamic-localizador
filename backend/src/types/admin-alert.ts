import type {
  AdminAlertNotificationStatus,
  AdminAlertSendAttemptStatus,
  AdminAlertSeverity,
  AdminAlertTemplateCategory,
  AdminAlertType,
} from "../constants/admin-alert";

export type AdminAlertNotification = {
  id: string;
  companyId: string;
  recipientId: string;
  employeeId: string | null;
  operationId: string | null;
  absenceRequestId: string | null;
  alertType: AdminAlertType;
  severity: AdminAlertSeverity;
  templateCategory: AdminAlertTemplateCategory;
  deduplicationKey: string;
  recipientPhone: string;
  contentVariablesJson: string;
  status: AdminAlertNotificationStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerMessageSid: string | null;
  providerStatus: string | null;
  activeSendAttemptId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  occurredAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAlertNotificationSendAttempt = {
  id: string;
  companyId: string;
  notificationId: string;
  attemptNumber: number;
  status: AdminAlertSendAttemptStatus;
  providerMessageSid: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAlertEmitInput = {
  companyId: string;
  type: AdminAlertType;
  severity?: AdminAlertSeverity;
  category?: AdminAlertTemplateCategory;
  employeeId?: string | null;
  operationId?: string | null;
  absenceRequestId?: string | null;
  deduplicationKey: string;
  payload: AdminAlertTemplatePayload;
  occurredAt?: Date;
};

export type AdminAlertTemplatePayload = {
  employeeName: string;
  serviceName?: string | null;
  serviceAddress?: string | null;
  serviceLocality?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  operationTimezone?: string | null;
};

export type AdminAlertEmitResult = {
  enqueued: number;
  dedupSkipped: number;
  recipientSkipped: number;
};

export type MissingCheckinCandidate = {
  employeeWorkdayId: string;
  employeeId: string;
  employeeName: string;
  operationId: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  operationTimezone: string;
};
