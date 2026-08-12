import type { OperationKind } from "../constants/operation-kind";
import type { CheckoutStatus } from "../constants/checkout-status";
import type { PunctualityStatus } from "../types/domain";
import type { DerivedEmployeeWorkdayState } from "./employee-workday-state";

/** Period-over-period rate comparison (defined in types to keep utils → types direction). */
export interface PeriodMetricDelta {
  current: number;
  previous: number;
  absoluteDelta: number;
  percentDelta: number | null;
  currentSample: number;
  previousSample: number;
  comparable: boolean;
}

export type StatisticsActionExceptionKey =
  | "open_attendance"
  | "unjustified_absence"
  | "outside_geofence"
  | "pending_review"
  | "late_arrival"
  | "early_departure";

export interface StatisticsActionExceptionItem {
  key: StatisticsActionExceptionKey;
  status: StatisticsActionExceptionKey;
  label: string;
  count: number;
  /** Null when there is no valid universe for a rate. */
  rate: number | null;
  denominator: number;
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
  /** True when open-attendance workdays make hours totals non-definitive. */
  hoursDataIncomplete: boolean;
  /** Workdays with a location status (geofence-evaluable). */
  locationEvaluableWorkdays: number;
  /** Workdays with a validation status. */
  validationEvaluableWorkdays: number;
  /** Workdays with a completed checkout (early-departure universe). */
  checkoutEvaluableWorkdays: number;
}

export interface AttendanceStatisticsPeriodComparison {
  attendanceRate: PeriodMetricDelta;
  punctualityRate: PeriodMetricDelta;
  absenceRate: PeriodMetricDelta;
  openAttendanceRate: PeriodMetricDelta;
  outsideGeofenceRate: PeriodMetricDelta;
}

export interface AttendanceStatisticsSummaryPayload extends AttendanceStatisticsSummary {
  previousPeriod: AttendanceStatisticsSummary | null;
  comparison: AttendanceStatisticsPeriodComparison | null;
  minSampleWorkdays: number;
  companyTimeZone: string;
  companyLocalDate: string;
  actionExceptions: StatisticsActionExceptionItem[];
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
  attendanceRate: number;
  punctualityRate: number;
  /** Day still in progress in company reference clock. */
  isPartial: boolean;
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
  openAttendanceWorkdays: number;
  incidentCount: number;
  sampleInsufficient: boolean;
  primaryIncidentLabel: string | null;
  lastAttendanceDate: string | null;
}

export interface AttendanceByOperationRow {
  operationId: string;
  operationKind: string;
  /** Human-readable label: service + date/time (never UUID as primary). */
  displayLabel: string;
  serviceId: string | null;
  serviceName: string;
  serviceAddress: string | null;
  scheduledStart: string | null;
  scheduledWorkdays: number;
  presentWorkdays: number;
  absentWorkdays: number;
  justifiedWorkdays: number;
  expectedOpenWorkdays: number;
  expectedStaffWorkdays: number;
  attendanceRate: number;
  coverageRate: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  openAttendanceWorkdays: number;
  incidentCount: number;
  sampleInsufficient: boolean;
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
  coverageRate: number;
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
  openAttendanceWorkdays: number;
  incidentCount: number;
  incidentRate: number;
  sampleInsufficient: boolean;
}

export interface AttendanceWorkdayDetailRow {
  workDate: string;
  employeeName: string;
  employeeType: string | null;
  serviceName: string;
  operationKind: OperationKind;
  expectedStartAt: string;
  expectedEndAt: string | null;
  effectiveState: DerivedEmployeeWorkdayState;
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
