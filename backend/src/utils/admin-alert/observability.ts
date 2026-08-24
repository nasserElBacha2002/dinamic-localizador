type AdminAlertObservabilityEvent =
  | "ADMIN_ALERT_ENQUEUED"
  | "ADMIN_ALERT_DEDUP_SKIPPED"
  | "ADMIN_ALERT_SENT"
  | "ADMIN_ALERT_FAILED"
  | "ADMIN_ALERT_RETRY"
  | "ADMIN_ALERT_RECIPIENT_SKIPPED";

type AdminAlertObservabilityPayload = {
  companyId?: string;
  recipientId?: string;
  alertType?: string;
  outboxId?: string;
  operationId?: string | null;
  employeeId?: string | null;
  providerMessageSid?: string | null;
  deduplicationKey?: string;
  reason?: string;
};

export const logAdminAlertEvent = (
  event: AdminAlertObservabilityEvent,
  payload: AdminAlertObservabilityPayload,
): void => {
  console.info(`[admin-alert] ${event}`, payload);
};
