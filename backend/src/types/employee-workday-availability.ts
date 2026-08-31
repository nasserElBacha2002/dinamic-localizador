import type { OperationKind } from "../constants/operation-kind";

export type EmployeeWorkdayAttendanceContext = {
  employeeWorkdayId: string;
  operationWorkdayId: string;
  operationId: string;
  serviceId: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  serviceLatitude: number;
  serviceLongitude: number;
  allowedRadiusMeters: number;
  operationKind: OperationKind;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  scheduleTimezone: string;
  expectationStatus: "EXPECTED" | "JUSTIFIED";
  absenceRequestId: string | null;
  operationAssignmentId: string | null;
};

export type EmployeeWorkdayCheckInCandidate = EmployeeWorkdayAttendanceContext;

export type EmployeeWorkdayCheckoutCandidate = EmployeeWorkdayAttendanceContext & {
  /**
   * Open check-in attendance id when checking out after arrival.
   * Null for exit-without-arrival candidates (no attendance yet).
   */
  attendanceRecordId: string | null;
  /** Null when arrival was never recorded. */
  checkInAt: string | null;
  /** True when resolving checkout from assignment without prior check-in. */
  checkoutWithoutArrival: boolean;
};

export type WorkdaySelectionOption = {
  employeeWorkdayId: string;
  operationWorkdayId: string;
  operationId: string;
  attendanceRecordId?: string | null;
  /** Present on mixed llegada/salida action lists (location-first). */
  attendanceAction?: "CHECK_IN" | "CHECK_OUT";
  /** True when the option is exit-without-arrival (no attendance yet). */
  checkoutWithoutArrival?: boolean;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  expectedStartAt: string;
  expectedEndAt: string | null;
  workDate: string;
  checkInAt?: string | null;
};
