export type AbsenceRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "NEEDS_INFO";

export type AbsenceRequestedVia = "WHATSAPP" | "ADMIN";

export type AbsenceDayPeriod = "FULL_DAY" | "AM" | "PM";

export type AbsenceAttachmentPolicy = "FORBIDDEN" | "OPTIONAL" | "REQUIRED";

export type AbsenceAttachmentStatus =
  | "PENDING_UPLOAD"
  | "UPLOADING"
  | "AVAILABLE"
  | "QUARANTINED"
  | "REJECTED"
  | "FAILED"
  | "PENDING_DELETE"
  | "DELETED";

export type AbsenceAttachmentScanStatus = "UNSCANNED" | "CLEAN" | "INFECTED" | "SKIPPED";

export type AbsenceAttachmentSource = "ADMIN" | "WHATSAPP" | "EMPLOYEE";

export interface AbsenceType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requiresApproval: boolean;
  /** @deprecated Prefer attachmentPolicy; kept for backward compatibility. */
  requiresAttachment: boolean;
  attachmentPolicy?: AbsenceAttachmentPolicy;
  deductsBalance: boolean;
  allowsHalfDay: boolean;
  dayCountingMode?: "CALENDAR_DAYS" | "BUSINESS_DAYS";
  calendarId?: string | null;
  isActive: boolean;
}

/** Safe DTO — never includes bucket, objectKey, or checksum. */
export interface AbsenceRequestAttachmentDto {
  id: string;
  absenceRequestId: string;
  originalFileName: string;
  normalizedFileName: string;
  detectedContentType: string;
  sizeBytes: number;
  status: AbsenceAttachmentStatus;
  scanStatus: AbsenceAttachmentScanStatus;
  source: AbsenceAttachmentSource;
  uploadedByUserId: string | null;
  uploadedByEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
  availableAt: string | null;
}

export interface AbsenceAttachmentStorageHealth {
  featureEnabled: boolean;
  storageConfigured: boolean;
  storageAvailable: boolean;
  message: string | null;
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
  calculationMode?: "CALENDAR_DAYS" | "BUSINESS_DAYS" | null;
  calendarId?: string | null;
  calendarTimezone?: string | null;
  calculationVersion?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbsenceRequestEvent {
  id: string;
  absenceRequestId: string;
  eventType: string;
  oldStatus: AbsenceRequestStatus | null;
  newStatus: AbsenceRequestStatus | null;
  performedByUserId: string | null;
  performedByEmployeeId: string | null;
  comment: string | null;
  createdAt: string;
  performerName?: string | null;
}

export interface AbsenceRequestListItem extends AbsenceRequest {
  employee: {
    id: string;
    name: string;
    phoneNumber: string;
    active: boolean;
  };
  absenceType: {
    id: string;
    code: string;
    name: string;
  };
  reviewerName?: string | null;
  affectedOperationsCount: number;
}

export interface AffectedOperationWarning {
  operationId: string;
  serviceId: string;
  serviceName: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  status: string;
}

export interface AbsenceRequestDetail extends AbsenceRequestListItem {
  events: AbsenceRequestEvent[];
  affectedOperations: AffectedOperationWarning[];
  balanceImpact?: AbsenceBalanceImpact | null;
  workdayReconciliation?: AbsenceWorkdayReconciliationResult;
}

export interface AbsenceWorkdayReconciliationResult {
  justified: number;
  restored: number;
  relinked: number;
  unchanged: number;
  attendanceConflicts: number;
}

export interface EmployeeAbsenceBalanceSummary {
  absenceType: {
    id: string;
    code: string;
    name: string;
    deductsBalance: boolean;
  };
  year: number;
  assignedDays: number;
  approvedDays: number;
  pendingDays: number;
  rejectedDays: number;
  cancelledDays: number;
  grantedDays?: number;
  reservedDays?: number;
  consumedDays?: number;
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

export interface UpsertEmployeeAbsenceBalanceInput {
  year: number;
  totalDays: number;
  notes?: string | null;
}

export type AbsenceBalanceAdjustmentOperation = "CREDIT" | "DEBIT";

export interface AdjustEmployeeAbsenceBalanceInput {
  year: number;
  quantity: number;
  operation: AbsenceBalanceAdjustmentOperation;
  reason: string;
  idempotencyKey: string;
}

export type AbsenceBalanceMovementType =
  | "INITIAL_GRANT"
  | "MANUAL_CREDIT"
  | "MANUAL_DEBIT"
  | "RESERVE"
  | "RELEASE"
  | "CONSUME"
  | "REVERSAL"
  | "MIGRATION_ADJUSTMENT";

export interface AbsenceBalanceMovement {
  id: string;
  companyId: string;
  balanceId: string;
  employeeId: string;
  absenceTypeId: string;
  periodYear: number;
  absenceRequestId: string | null;
  movementType: AbsenceBalanceMovementType;
  quantity: number;
  direction: "CREDIT" | "DEBIT";
  idempotencyKey: string;
  reason: string | null;
  performedByUserId: string | null;
  performedByEmployeeId: string | null;
  createdAt: string;
}

export interface AbsenceBalanceMovementsFilters {
  year?: number;
  page?: number;
  limit?: number;
  movementType?: AbsenceBalanceMovementType;
}

export interface AbsenceRequestFilters {
  page?: number;
  limit?: number;
  status?: AbsenceRequestStatus;
  absenceTypeId?: string;
  employeeId?: string;
  employeeIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateAbsenceRequestInput {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod?: AbsenceDayPeriod;
  endPeriod?: AbsenceDayPeriod;
  reason: string;
  requestedVia?: AbsenceRequestedVia;
}

/** Editable fields while the request is in NEEDS_INFO (admin update before resubmit). */
export interface UpdateNeedsInfoAbsenceRequestInput {
  absenceTypeId?: string;
  startDate?: string;
  endDate?: string;
  startPeriod?: AbsenceDayPeriod;
  endPeriod?: AbsenceDayPeriod;
  reason?: string;
}
