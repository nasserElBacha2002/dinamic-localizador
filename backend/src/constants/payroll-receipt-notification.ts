export const PAYROLL_RECEIPT_NOTIFICATION_TYPE = "PAYROLL_RECEIPT_AVAILABLE" as const;

export type PayrollReceiptNotificationType = typeof PAYROLL_RECEIPT_NOTIFICATION_TYPE;

export type PayrollReceiptNotificationStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "CANCELLED"
  | "SENT_RECOVERY_REQUIRED";

/** Default max attempts when env is not loaded (tests / constants). */
export const PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS = 5;

export const PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_LEASE_SECONDS = 120;
