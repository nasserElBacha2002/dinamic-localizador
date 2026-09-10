import type { CheckoutStatus, PunctualityStatus } from "./attendance";

export type StatisticsValidationStatus =
  | "VALID"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "NO_CHECK_IN"
  | "";

export type StatisticsEffectiveState =
  | "EXPECTED"
  | "JUSTIFIED"
  | "PRESENT"
  | "ABSENT"
  | "CANCELLED"
  | "";

export type StatisticsOperationKind = "ONE_TIME" | "RECURRING" | "";

export interface PeriodMetricDelta {
  current: number;
  previous: number;
  absoluteDelta: number;
  percentDelta: number | null;
  currentSample: number;
  previousSample: number;
  comparable: boolean;
}

export interface AttendanceStatisticsPeriodComparison {
  attendanceRate: PeriodMetricDelta;
  punctualityRate: PeriodMetricDelta;
  absenceRate: PeriodMetricDelta;
  openAttendanceRate: PeriodMetricDelta;
  outsideGeofenceRate: PeriodMetricDelta;
}

export interface AttendanceStatisticsSummary {
  scheduledWorkdays: number;
  attendanceRequiredWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  expectedOpenWorkdays: number;
  cancelledWorkdays: number;
  attendanceRate: number;
  absenceRate: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  earlyDepartureWorkdays: number;
  workedMinutes: number;
  overtimeMinutes: number;
  openAttendanceWorkdays: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  rejectedCount: number;
  manuallyAcceptedCount: number;
  totalOperations: number;
  incompleteCoverageOperations: number;
  coverageRate: number;
  hoursDataIncomplete: boolean;
  locationEvaluableWorkdays?: number;
  validationEvaluableWorkdays?: number;
  checkoutEvaluableWorkdays?: number;
  previousPeriod?: AttendanceStatisticsSummary | null;
  comparison?: AttendanceStatisticsPeriodComparison | null;
  minSampleWorkdays?: number;
  companyTimeZone?: string;
  companyLocalDate?: string;
  actionExceptions?: AttendanceStatusDistributionItem[];
  operationalIncidents?: OperationalIncidentSummaryMetrics | null;
  operationalIncidentsStatus?: "AVAILABLE" | "UNAVAILABLE";
  operationalIncidentsNonExclusive?: boolean;
}

export type OperationalIncidentType =
  | "COVERAGE_REQUIRED"
  | "OPERATION_MODIFIED"
  | "NOT_CONFIRMED"
  | "NOT_CONFIRMED_AND_ABSENT"
  | "MISSING_CHECK_IN"
  | "MISSING_CHECK_OUT"
  | "NO_PUNCH";

export interface OperationalIncidentSummaryMetrics {
  availability?: "AVAILABLE" | "UNAVAILABLE";
  operationsWithAnyIncident: number;
  operationsWithCoverage: number;
  coverageEvents: number;
  modifiedOperations: number;
  operationChangeEvents: number;
  operationsWithUnconfirmedAssignments: number;
  notConfirmedBeforeStart: number;
  notConfirmedAndAbsent: number;
  operationsWithIncompletePunches: number;
  incompleteWorkdays: number;
  missingCheckIn: number;
  missingCheckOut: number;
  noPunch: number;
  evaluableOperations: number;
  confirmationEligibleAssignments?: number;
  punchEvaluableWorkdays?: number;
  changeTraceableOperations?: number;
  changeEventsReliableFrom: string | null;
  coverageReliableFrom?: string | null;
  coverageEventsReliableHistorically: boolean;
}

export interface OperationalIncidentDetailRow {
  detailId: string;
  incidentType: OperationalIncidentType;
  incidentLabel: string;
  operationId: string;
  operationalDate: string;
  serviceName: string;
  serviceAddress: string | null;
  workTeamName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  operationStatus: string;
  operationKind: string;
  confirmationStatus: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  eventAt: string | null;
  origin: string | null;
  reason: string | null;
  actorUserId: string | null;
  actorName?: string | null;
}

export interface AttendanceTimelinePoint {
  date: string;
  present: number;
  absent: number;
  justified: number;
  expected: number;
  scheduled: number;
  onTime: number;
  late: number;
  outsideGeofence: number;
  pendingReview: number;
  rejected: number;
  attendanceRate?: number;
  punctualityRate?: number;
  isPartial?: boolean;
}

export interface AttendanceStatusDistributionItem {
  status: string;
  label: string;
  count: number;
  rate?: number | null;
  denominator?: number;
  key?: string;
}

export interface AttendanceByEmployeeRow {
  employeeId: string;
  employeeName: string;
  phoneNumber: string;
  scheduledWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  expectedOpenWorkdays: number;
  attendanceRate: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  earlyDepartureWorkdays: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  openAttendanceWorkdays?: number;
  incidentCount?: number;
  sampleInsufficient?: boolean;
  primaryIncidentLabel?: string | null;
  lastAttendanceDate: string | null;
}

export interface AttendanceByOperationRow {
  operationId: string;
  operationKind: string;
  displayLabel?: string;
  serviceId?: string | null;
  serviceName: string;
  serviceAddress: string | null;
  scheduledStart: string | null;
  scheduledWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  expectedOpenWorkdays: number;
  expectedStaffWorkdays?: number;
  attendanceRate: number;
  coverageRate?: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  openAttendanceWorkdays?: number;
  incidentCount?: number;
  sampleInsufficient?: boolean;
  operationalStatus: string;
}

export interface AttendanceByServiceRow {
  serviceId: string;
  serviceName: string;
  address: string | null;
  totalOperations: number;
  scheduledWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  expectedOpenWorkdays: number;
  attendanceRate: number;
  coverageRate?: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  openAttendanceWorkdays?: number;
  incidentCount?: number;
  incidentRate?: number;
  sampleInsufficient?: boolean;
}

export interface AttendanceWorkdayDetailRow {
  workDate: string;
  employeeName: string;
  employeeType: string | null;
  serviceName: string;
  operationKind: Exclude<StatisticsOperationKind, "">;
  expectedStartAt: string;
  expectedEndAt: string | null;
  effectiveState: Exclude<StatisticsEffectiveState, "">;
  checkInAt: string | null;
  arrivalStatus: PunctualityStatus | null;
  checkOutAt: string | null;
  checkoutStatus: CheckoutStatus | null;
  workedMinutes: number;
  overtimeMinutes: number;
  absenceTypeName: string | null;
  /** @deprecated use effectiveState = JUSTIFIED */
  justified: boolean;
}

export interface StatisticsFilters {
  dateFrom?: string;
  dateTo?: string;
  operationId?: string;
  serviceId?: string;
  employeeId?: string;
  workTeamId?: string;
  operationIds?: string[];
  serviceIds?: string[];
  employeeIds?: string[];
  workTeamIds?: string[];
  operationKind?: StatisticsOperationKind;
  operationStatus?: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "";
  effectiveState?: StatisticsEffectiveState;
  validationStatus?: StatisticsValidationStatus;
  locationStatus?: string;
  punctualityStatus?: string;
  confirmationStatus?: "PENDING" | "CONFIRMED" | "UNAVAILABLE" | "";
  punchCompleteness?: "COMPLETE" | "MISSING_CHECK_OUT" | "MISSING_CHECK_IN" | "NO_PUNCH" | "";
  incidentType?: OperationalIncidentType | "";
  openAttendance?: boolean;
  incompleteCoverage?: boolean;
  rankingMode?:
    | "attention_employees"
    | "late_employees"
    | "low_coverage_operations"
    | "incident_services";
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  export?: boolean;
}
