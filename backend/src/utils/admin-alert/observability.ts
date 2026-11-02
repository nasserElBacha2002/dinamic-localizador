type AdminAlertObservabilityEvent =
  | "ADMIN_ALERT_ENQUEUED"
  | "ADMIN_ALERT_DEDUP_SKIPPED"
  | "ADMIN_ALERT_SENT"
  | "ADMIN_ALERT_FAILED"
  | "ADMIN_ALERT_RETRY"
  | "ADMIN_ALERT_RECIPIENT_SKIPPED"
  | "ADMIN_ALERT_CHANNEL_SUPPRESSED"
  | "ADMIN_ALERT_CUTOVER_APPLIED"
  | "ADMIN_ALERT_CUTOVER_ROLLBACK"
  | "ADMIN_ALERT_PENDING_SUPPRESSED"
  | "ATTENDANCE_ALERT_EVALUATED"
  | "ATTENDANCE_THRESHOLD_CROSSED"
  | "ATTENDANCE_ALERT_BASELINED"
  | "ATTENDANCE_ALERT_COOLDOWN_SKIPPED"
  | "ABSENCE_REQUEST_ADMIN_ALERT_EMIT";

type AdminAlertObservabilityPayload = {
  companyId?: string;
  recipientId?: string;
  alertType?: string;
  outboxId?: string;
  operationId?: string | null;
  employeeId?: string | null;
  absenceRequestId?: string | null;
  providerMessageSid?: string | null;
  deduplicationKey?: string;
  reason?: string;
  rate?: number | null;
  sampleSize?: number;
  crossingSequence?: number;
  mode?: string;
  channel?: string;
  origin?: string;
  before?: string;
  after?: string;
  actorUserId?: string;
  suppressedCount?: number;
  configVersion?: string;
  category?: string;
  enqueuedCount?: number;
  dedupSkippedCount?: number;
  recipientSkippedCount?: number;
  emitOutcome?: string;
  conversationId?: string | null;
};

export const logAdminAlertEvent = (
  event: AdminAlertObservabilityEvent,
  payload: AdminAlertObservabilityPayload,
): void => {
  console.info(`[admin-alert] ${event}`, payload);
};
