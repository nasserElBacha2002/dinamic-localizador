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
};

export type EmployeeWorkdayCheckInCandidate = EmployeeWorkdayAttendanceContext;

export type EmployeeWorkdayCheckoutCandidate = EmployeeWorkdayAttendanceContext & {
  attendanceRecordId: string;
  checkInAt: string;
};

export type WorkdaySelectionOption = {
  employeeWorkdayId: string;
  operationWorkdayId: string;
  operationId: string;
  attendanceRecordId?: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  expectedStartAt: string;
  expectedEndAt: string | null;
  workDate: string;
  checkInAt?: string;
};
