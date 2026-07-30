import type { Employee } from "./domain";
import type { AbsenceWorkdayReconciliationResult } from "./absence-workday-reconciliation";

export type AbsenceRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "NEEDS_INFO";

export type AbsenceRequestedVia = "WHATSAPP" | "ADMIN";

export type AbsenceDayPeriod = "FULL_DAY" | "AM" | "PM";

export type AbsenceRequestEventType =
  | "CREATED"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_INFO"
  | "CANCELLED"
  | "UPDATED"
  | "RESUBMITTED";

export interface AbsenceType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requiresApproval: boolean;
  /** @deprecated Prefer attachmentPolicy; kept for backward compatibility. */
  requiresAttachment: boolean;
  attachmentPolicy: import("./absence-attachment").AbsenceAttachmentPolicy;
  deductsBalance: boolean;
  allowsHalfDay: boolean;
  /** CALENDAR_DAYS preserves legacy inclusive counting; BUSINESS_DAYS uses company calendar. */
  dayCountingMode: import("./absence-calendar").AbsenceTypeCalendarFields["dayCountingMode"];
  /** When null, the company default work calendar is used. */
  calendarId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AbsenceRequest {
  id: string;
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
  totalDays: number;
  reason: string;
  status: AbsenceRequestStatus;
  requestedVia: AbsenceRequestedVia;
  sourceMessageSid: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  cancelledAt: string | null;
  calculationMode: import("./absence-calendar").AbsenceCalculationSnapshot["calculationMode"];
  calendarId: string | null;
  calendarTimezone: string | null;
  calculationVersion: number | null;
  calendarVersion: number | null;
  calculationInputHash: string | null;
  reservationVersion: number;
  yearAllocationsJson: string | null;
  attachmentPolicySnapshot: import("./absence-attachment").AbsenceAttachmentPolicy | null;
  operationalImpactVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Approved absence requests justify EmployeeWorkday expectations regardless of absence type.
 * Type-specific flags (requiresApproval, deductsBalance, etc.) govern request workflow and balances only.
 */
export interface ApprovedAbsenceForWorkday extends AbsenceRequest {
  absenceTypeName: string;
}

export interface AbsenceRequestEvent {
  id: string;
  absenceRequestId: string;
  eventType: AbsenceRequestEventType;
  oldStatus: AbsenceRequestStatus | null;
  newStatus: AbsenceRequestStatus | null;
  performedByUserId: string | null;
  performedByEmployeeId: string | null;
  comment: string | null;
  createdAt: string;
  performerName?: string | null;
}

export interface AbsenceRequestWithRelations extends AbsenceRequest {
  employee: Pick<Employee, "id" | "name" | "phoneNumber" | "active">;
  absenceType: Pick<AbsenceType, "id" | "code" | "name">;
  reviewerName?: string | null;
  affectedOperationsCount: number;
}

export interface AbsenceRequestDetail extends AbsenceRequestWithRelations {
  events: AbsenceRequestEvent[];
  affectedOperations: AffectedOperationWarning[];
  balanceImpact: AbsenceBalanceImpact | null;
  workdayReconciliation?: AbsenceWorkdayReconciliationResult;
}

export interface EmployeeAbsenceBalance {
  id: string;
  employeeId: string;
  absenceTypeId: string;
  year: number;
  totalDays: number;
  grantedDays?: number;
  reservedDays?: number;
  consumedDays?: number;
  availableDays?: number;
  version?: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbsenceBalanceSummary {
  absenceType: Pick<AbsenceType, "id" | "code" | "name" | "deductsBalance">;
  year: number;
  /** @deprecated Use grantedDays */
  assignedDays: number;
  /** @deprecated Use consumedDays */
  approvedDays: number;
  /** @deprecated Use reservedDays */
  pendingDays: number;
  rejectedDays: number;
  cancelledDays: number;
  grantedDays: number;
  reservedDays: number;
  consumedDays: number;
  availableDays: number;
  projectedAvailableDays: number;
  notes: string | null;
  version?: number;
}

export interface AbsenceBalanceImpact {
  deductsBalance: boolean;
  year: number;
  requestDays: number;
  assignedDays?: number;
  approvedDays?: number;
  pendingDays?: number;
  availableDays?: number;
  availableAfterApproval?: number;
  hasSufficientBalance?: boolean;
  message?: string;
}

export interface AffectedOperationWarning {
  operationId: string;
  serviceId: string;
  serviceName: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  status: string;
}

export interface AbsenceRequestDraft {
  absenceTypeId?: string;
  absenceTypeCode?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}
