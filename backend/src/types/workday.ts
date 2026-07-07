import type { OperationWorkdayStatus } from "../constants/workday-status";
import type { EmployeeWorkdayExpectationStatus } from "../constants/workday-status";

export interface OperationWorkday {
  id: string;
  companyId: string;
  operationId: string;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  scheduleVersion: number;
  scheduleSourceSnapshot: "COMPANY" | "CUSTOM" | null;
  scheduleTimezoneSnapshot: string | null;
  status: OperationWorkdayStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeWorkday {
  id: string;
  companyId: string;
  operationWorkdayId: string;
  operationAssignmentId: string | null;
  employeeId: string;
  expectationStatus: EmployeeWorkdayExpectationStatus;
  absenceRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedOperationWorkday {
  workDate: string;
  expectedStartAt: Date;
  expectedEndAt: Date | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  timezone: string;
  scheduleVersion: number;
  checkInWindowStartAt: Date;
  checkInWindowEndAt: Date;
}
