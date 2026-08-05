import type {
  PayrollReceiptNotificationStatus,
  PayrollReceiptNotificationType,
} from "../constants/payroll-receipt-notification";

export type PayrollReceiptNotification = {
  id: string;
  companyId: string;
  payrollReceiptId: string;
  employeeId: string;
  notificationType: PayrollReceiptNotificationType;
  status: PayrollReceiptNotificationStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerMessageSid: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};
