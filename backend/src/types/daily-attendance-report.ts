import type {
  DailyAttendanceReportDeliveryStatus,
  DailyAttendanceReportRunStatus,
} from "../constants/daily-attendance-report";

export interface CompanyReportEmailRecipient {
  id: string;
  companyId: string;
  email: string;
  displayName: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CompanyReportEmailRecipientInput = {
  email: string;
  displayName?: string | null;
  isEnabled?: boolean;
};

export type CompanyReportEmailRecipientUpdateInput = {
  email?: string;
  displayName?: string | null;
  isEnabled?: boolean;
};

export interface DailyAttendanceReportTotals {
  operationsCount: number;
  scheduledEmployeesCount: number;
  presentCount: number;
  checkinCount: number;
  checkoutCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  unavailableCount: number;
  justifiedCount: number;
  pendingConfirmationCount: number;
  missingCheckinCount: number;
  missingCheckoutCount: number;
  incompleteCount: number;
}

export interface DailyAttendanceReportOperationBreakdown {
  operationId: string;
  operationWorkdayId: string;
  workDate: string;
  serviceName: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  scheduledEmployees: number;
  present: number;
  missingCheckin: number;
  missingCheckout: number;
  late: number;
  earlyLeave: number;
  unavailable: number;
  justified: number;
  pendingConfirmation: number;
  incomplete: number;
}

export interface DailyAttendanceReportIncident {
  kind:
    | "MISSING_CHECKIN"
    | "MISSING_CHECKOUT"
    | "LATE"
    | "EARLY_LEAVE"
    | "UNAVAILABLE"
    | "PENDING_CONFIRMATION"
    | "INCOMPLETE";
  employeeName: string;
  serviceName: string;
  operationId: string;
  detail: string;
}

export interface DailyAttendanceReportPayload {
  companyId: string;
  companyName: string;
  reportDate: string;
  timezoneId: string;
  /** Evaluation instant used for incomplete vs missing (ISO UTC). */
  evaluatedAtIso: string;
  totals: DailyAttendanceReportTotals;
  operations: DailyAttendanceReportOperationBreakdown[];
  /** Cap applied in builder; aggregator may return more. */
  incidents: DailyAttendanceReportIncident[];
  totalIncidentCount: number;
  hasActivity: boolean;
}

export type DailyAttendanceReportEmailSnapshot = {
  subject: string;
  text: string;
  html: string;
};

export interface DailyAttendanceReportRun {
  id: string;
  companyId: string;
  reportDate: string;
  timezoneId: string;
  reportTimeLocal: string;
  status: DailyAttendanceReportRunStatus;
  recipientCount: number;
  totals: DailyAttendanceReportTotals;
  totalIncidentCount: number;
  templateVersion: string | null;
  emailSnapshot: DailyAttendanceReportEmailSnapshot | null;
  evaluatedAt: string | null;
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  generatedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface DailyAttendanceReportDelivery {
  id: string;
  reportRunId: string;
  companyId: string;
  recipientId: string;
  emailSnapshot: string;
  displayNameSnapshot: string | null;
  status: DailyAttendanceReportDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  processedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}
