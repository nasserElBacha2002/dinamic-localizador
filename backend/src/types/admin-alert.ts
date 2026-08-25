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

/** Operational/security admin alerts (admin_operational_alert template). */
export type AdminAlertOperationalTemplatePayload = {
  employeeName: string;
  serviceName?: string | null;
  serviceAddress?: string | null;
  serviceLocality?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  operationTimezone?: string | null;
  /** Phase D — attendance threshold (display values only). */
  attendanceRatePercent?: number;
  attendanceThresholdPercent?: number;
  attendanceWindowDays?: number;
  attendanceEvaluatedWorkdays?: number;
};

/** Request admin alerts (admin_request_alert template). Phase C: absence pending review. */
export type AdminAlertRequestTemplatePayload = {
  employeeName: string;
  absenceTypeName: string;
  startDate: string;
  endDate: string;
  statusLabel: string;
};

export type AdminAlertTemplatePayload =
  | AdminAlertOperationalTemplatePayload
  | AdminAlertRequestTemplatePayload;

export const isAdminAlertRequestPayload = (
  payload: AdminAlertTemplatePayload,
  category: AdminAlertTemplateCategory,
): payload is AdminAlertRequestTemplatePayload => {
  if (category !== "REQUEST" && !("absenceTypeName" in payload)) {
    return false;
  }
  const candidate = payload as AdminAlertRequestTemplatePayload;
  return (
    typeof candidate.employeeName === "string" &&
    typeof candidate.absenceTypeName === "string" &&
    typeof candidate.startDate === "string" &&
    typeof candidate.endDate === "string" &&
    typeof candidate.statusLabel === "string"
  );
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

/** Missing outbox obligation: one domain event × one eligible recipient. */
export type AdminAlertOutboxObligation = {
  companyId: string;
  recipientId: string;
  recipientPhone: string;
  alertType: AdminAlertType;
  category: AdminAlertTemplateCategory;
  severity: AdminAlertSeverity;
  employeeId: string;
  operationId: string | null;
  absenceRequestId: string | null;
  deduplicationKey: string;
  occurredAt: string;
  payload: AdminAlertTemplatePayload;
};

export type UnavailableAlertCandidate = {
  companyId: string;
  assignmentId: string;
  employeeId: string;
  operationId: string;
  scheduleVersion: number;
  employeeName: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  occurredAt: string;
};

export type PendingAbsenceAlertCandidate = {
  companyId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  absenceTypeName: string;
  startDate: string;
  endDate: string;
  occurredAt: string;
};
