export const OPERATION_ASSIGNMENT_NOTIFICATION_TYPE = "EVENTUAL_OPERATION_ASSIGNED" as const;

export type OperationAssignmentNotificationType =
  typeof OPERATION_ASSIGNMENT_NOTIFICATION_TYPE;

/**
 * Outbox status. SEND_ACCEPTED = Twilio accepted (SID known).
 * DELIVERED is never stored here — only via provider callback on whatsapp_messages.
 */
export type OperationAssignmentNotificationStatus =
  | "PENDING"
  | "PROCESSING"
  | "SEND_STARTED"
  | "SEND_ACCEPTED"
  | "FAILED"
  | "CANCELLED"
  | "RECONCILIATION_REQUIRED"
  | "SENT_RECOVERY_REQUIRED";

export type OperationAssignmentSendAttemptStatus =
  | "STARTED"
  | "PROVIDER_ACCEPTED"
  | "PROVIDER_FAILED"
  | "AMBIGUOUS";

/** Default max attempts when env is not loaded (tests / constants). */
export const OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS = 5;
