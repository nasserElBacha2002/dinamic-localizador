export const PAYROLL_RECEIPT_NOTIFICATION_TYPE = "PAYROLL_RECEIPT_AVAILABLE" as const;

export type PayrollReceiptNotificationType = typeof PAYROLL_RECEIPT_NOTIFICATION_TYPE;

/**
 * Outbox status. SEND_ACCEPTED = Twilio accepted (SID known).
 * DELIVERED is never stored here — only via provider callback on whatsapp_messages.
 */
export type PayrollReceiptNotificationStatus =
  | "PENDING"
  | "PROCESSING"
  | "SEND_STARTED"
  | "SEND_ACCEPTED"
  | "FAILED"
  | "CANCELLED"
  | "RECONCILIATION_REQUIRED"
  | "SENT_RECOVERY_REQUIRED";

export type PayrollReceiptSendAttemptStatus =
  | "STARTED"
  | "PROVIDER_ACCEPTED"
  | "PROVIDER_FAILED"
  | "AMBIGUOUS";

/** Default max attempts when env is not loaded (tests / constants). */
export const PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS = 5;
