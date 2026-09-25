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
  scheduledWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  confirmedButAbsentWorkdays: number;
  unannouncedAbsenceWorkdays: number;
  pendingReviewAttendances: number;
  rejectedAttendances: number;
  outsideGeofenceAttendances: number;
  workedMinutes: number;
  extraWorkedMinutes: number;
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
    | "EARLY_LEAVE" | "EARLY_CHECKOUT"
    | "UNAVAILABLE"
    | "PENDING_CONFIRMATION"
    | "INCOMPLETE" | "CONFIRMED_BUT_ABSENT" | "UNANNOUNCED_ABSENCE" | "PENDING_REVIEW" | "REJECTED_ATTENDANCE" | "OUTSIDE_GEOFENCE";
  employeeName: string;
  serviceName: string;
  operationId: string;
  detail: string;
  expectedStartAt?: string | null;
  expectedEndAt?: string | null;
  actualAt?: string | null;
  differenceMinutes?: number | null;
  employeeWorkdayId?: string;
}

export interface DailyAttendanceReportWorkday {
  employeeWorkdayId: string;
  employeeName: string;
  serviceName: string;
  operationId: string;
  operationWorkdayId: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  receivedAt: string | null;
  checkoutAt: string | null;
  expectationStatus: string;
  confirmationStatus: string | null;
  punctualityStatus: string | null;
  validationStatus: string | null;
  state: string;
  late: boolean;
  earlyLeave: boolean;
  missingCheckin: boolean;
  missingCheckout: boolean;
  unavailable: boolean;
  justified: boolean;
  present: boolean;
  incomplete: boolean;
  operationShiftId?: string | null;
  shiftNameSnapshot?: string | null;
  locationStatus?: string | null;
  checkoutStatus?: string | null;
  workedMinutes?: number;
  extraWorkedMinutes?: number;
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
  workdays?: DailyAttendanceReportWorkday[];
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
  xlsxSnapshot: Buffer | null;
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
