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
}

export interface AttendanceStatusDistributionItem {
  status: string;
  label: string;
  count: number;
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
  lastAttendanceDate: string | null;
}

export interface AttendanceByOperationRow {
  operationId: string;
  operationKind: string;
  serviceName: string;
  serviceAddress: string | null;
  scheduledStart: string | null;
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
  onTimeWorkdays: number;
  lateWorkdays: number;
  punctualityRate: number;
  workedMinutes: number;
  overtimeMinutes: number;
  outsideGeofenceCount: number;
  pendingReviewCount: number;
}

import type { OperationKind } from "../constants/operation-kind";
import type { CheckoutStatus } from "../constants/checkout-status";
import type { PunctualityStatus } from "../types/domain";
import type { DerivedEmployeeWorkdayState } from "./employee-workday-state";

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
