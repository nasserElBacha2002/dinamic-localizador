export const ABSENCE_OPERATIONAL_EFFECT_TYPES = [
  "WORKDAY_JUSTIFIED",
  "EMPLOYEE_UNAVAILABLE",
  "OPERATION_WARNING",
  "ASSIGNMENT_CONFLICT",
  "ATTENDANCE_CONFLICT",
] as const;
export type AbsenceOperationalEffectType =
  (typeof ABSENCE_OPERATIONAL_EFFECT_TYPES)[number];

export const ABSENCE_OPERATIONAL_EFFECT_STATUSES = [
  "PENDING",
  "APPLIED",
  "FAILED",
  "REVERTED",
  "SUPERSEDED",
] as const;
export type AbsenceOperationalEffectStatus =
  (typeof ABSENCE_OPERATIONAL_EFFECT_STATUSES)[number];

export const ABSENCE_OPERATIONAL_CONFLICT_TYPES = [
  "ASSIGNMENT_DURING_ABSENCE",
  "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
  "RESPONSIBLE_UNAVAILABLE",
  "OPERATION_AFFECTED",
] as const;
export type AbsenceOperationalConflictType =
  (typeof ABSENCE_OPERATIONAL_CONFLICT_TYPES)[number];

export const ABSENCE_OPERATIONAL_CONFLICT_SEVERITIES = [
  "INFO",
  "WARNING",
  "CRITICAL",
] as const;
export type AbsenceOperationalConflictSeverity =
  (typeof ABSENCE_OPERATIONAL_CONFLICT_SEVERITIES)[number];

export const ABSENCE_OPERATIONAL_CONFLICT_STATUSES = [
  "OPEN",
  "RESOLVED",
  "DISMISSED",
] as const;
export type AbsenceOperationalConflictStatus =
  (typeof ABSENCE_OPERATIONAL_CONFLICT_STATUSES)[number];

export const ABSENCE_OPERATIONAL_RESOLUTION_CODES = [
  "ASSIGN_REPLACEMENT",
  "KEEP_REDUCED_STAFFING",
  "CANCEL_ASSIGNMENT",
  "DISMISS_WITH_REASON",
] as const;
export type AbsenceOperationalResolutionCode =
  (typeof ABSENCE_OPERATIONAL_RESOLUTION_CODES)[number];

export type EmployeeAbsenceAvailabilityStatus =
  | "AVAILABLE"
  | "PROVISIONALLY_UNAVAILABLE"
  | "UNAVAILABLE"
  | "PARTIALLY_UNAVAILABLE";

export type AbsenceOperationalWorkdayImpact = {
  employeeWorkdayId: string;
  workDate: string;
  operationId: string | null;
  serviceId: string | null;
  covered: boolean;
  hasAttendancePresence: boolean;
  conflictCode: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE" | null;
};

export type AbsenceOperationalAssignmentImpact = {
  assignmentId: string;
  operationId: string;
  serviceId: string;
  serviceName: string;
  employeeId: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  operationStatus: string;
  validFrom: string;
  validTo: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export type AbsenceOperationalStaffingWarning = {
  operationId: string;
  code: "RESPONSIBLE_UNAVAILABLE" | "OPERATION_AFFECTED";
  message: string;
};

export type AbsenceOperationalImpactResult = {
  absenceRequestId: string;
  operationalImpactVersion: number;
  featureEnabled: boolean;
  availabilityStatus: EmployeeAbsenceAvailabilityStatus;
  affectedOperations: number;
  affectedServices: number;
  affectedWorkdays: number;
  affectedAssignments: number;
  affectedWorkGroups: number;
  attendanceConflicts: number;
  staffingWarnings: AbsenceOperationalStaffingWarning[];
  requiresManualAction: boolean;
  operations: AbsenceOperationalAssignmentImpact[];
  workdays: AbsenceOperationalWorkdayImpact[];
  openConflicts: AbsenceOperationalConflictDto[];
  reconciliationStatus:
    | "NOT_APPLICABLE"
    | "PENDING"
    | "PROCESSING"
    | "PARTIALLY_APPLIED"
    | "APPLIED"
    | "FAILED"
    | "SUPERSEDED"
    | "REVERTED";
  reconciliationJobId: string | null;
  reconciliationLastError: string | null;
  reconciliationAttempts: number | null;
};

export type AbsenceOperationalConflictDto = {
  id: string;
  absenceRequestId: string;
  conflictType: AbsenceOperationalConflictType;
  severity: AbsenceOperationalConflictSeverity;
  status: AbsenceOperationalConflictStatus;
  operationId: string | null;
  serviceId: string | null;
  employeeId: string;
  assignmentId: string | null;
  employeeWorkdayId: string | null;
  replacementEmployeeId: string | null;
  resolutionCode: AbsenceOperationalResolutionCode | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  rangeStartAt: string | null;
  rangeEndAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const buildOperationalEffectIdempotencyKey = (input: {
  requestId: string;
  version: number;
  effectType: string;
  targetEntityId: string;
  action: string;
}): string =>
  `absence:${input.requestId}:${input.version}:${input.effectType}:${input.targetEntityId}:${input.action}`;

export const buildOperationalConflictIdempotencyKey = (input: {
  requestId: string;
  version: number;
  conflictType: string;
  targetEntityId: string;
}): string =>
  `absence:${input.requestId}:${input.version}:conflict:${input.conflictType}:${input.targetEntityId}`;
