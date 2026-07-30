export type EmployeeAbsenceAvailabilityStatus =
  | "AVAILABLE"
  | "PROVISIONALLY_UNAVAILABLE"
  | "UNAVAILABLE"
  | "PARTIALLY_UNAVAILABLE";

export type AbsenceOperationalConflictType =
  | "ASSIGNMENT_DURING_ABSENCE"
  | "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE"
  | "RESPONSIBLE_UNAVAILABLE"
  | "OPERATION_AFFECTED";

export type AbsenceOperationalConflictSeverity = "INFO" | "WARNING" | "CRITICAL";
export type AbsenceOperationalConflictStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export type AbsenceOperationalResolutionCode =
  | "ASSIGN_REPLACEMENT"
  | "KEEP_REDUCED_STAFFING"
  | "CANCEL_ASSIGNMENT"
  | "DISMISS_WITH_REASON";

export type AbsenceOperationalConflict = {
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
  createdAt: string;
  updatedAt: string;
};

export type AbsenceOperationalImpact = {
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
  staffingWarnings: Array<{
    operationId: string;
    code: string;
    message: string;
  }>;
  requiresManualAction: boolean;
  operations: Array<{
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
  }>;
  workdays: Array<{
    employeeWorkdayId: string;
    workDate: string;
    operationId: string | null;
    serviceId: string | null;
    covered: boolean;
    hasAttendancePresence: boolean;
    conflictCode: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE" | null;
  }>;
  openConflicts: AbsenceOperationalConflict[];
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

export type ResolveAbsenceOperationalConflictInput = {
  resolutionCode: AbsenceOperationalResolutionCode;
  resolutionReason: string;
  replacementEmployeeId?: string | null;
};
