import type {
  PayrollReceiptNotificationStatus,
  PayrollReceiptNotificationType,
  PayrollReceiptSendAttemptStatus,
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
  providerStatus: string | null;
  cancelRequestedAt: string | null;
  activeSendAttemptId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollReceiptNotificationSendAttempt = {
  id: string;
  companyId: string;
  notificationId: string;
  attemptNumber: number;
  status: PayrollReceiptSendAttemptStatus;
  providerMessageSid: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
