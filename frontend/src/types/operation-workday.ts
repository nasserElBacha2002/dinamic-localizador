export type OperationWorkdayStatus = "ACTIVE" | "CANCELLED";

export interface OperationWorkdaySummary {
  id: string;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  status: OperationWorkdayStatus;
  expectedEmployeesCount: number;
}

export type DerivedEmployeeWorkdayState =
  | "EXPECTED"
  | "JUSTIFIED"
  | "PRESENT"
  | "ABSENT"
  | "CANCELLED";

export interface EmployeeWorkdayAbsenceContext {
  absenceRequestId: string;
  absenceTypeName: string;
  absenceStartDate: string;
  absenceEndDate: string;
  hasAttendanceConflict: boolean;
}

export interface AbsenceWorkdayReconciliationResult {
  justified: number;
  restored: number;
  relinked: number;
  unchanged: number;
  attendanceConflicts: number;
}

export interface OperationWorkdayEmployeeSummary {
  employeeId: string;
  employeeName: string;
  expectationStatus: string;
  effectiveState: DerivedEmployeeWorkdayState;
  absenceContext: EmployeeWorkdayAbsenceContext | null;
  hasAttendanceConflict: boolean;
}

export interface OperationWorkdayDetail {
  workday: OperationWorkdaySummary;
  expectedEmployees: OperationWorkdayEmployeeSummary[];
}

export interface MaterializationResult {
  operationId: string;
  rangeStart: string;
  rangeEnd: string;
  operationWorkdaysCreated: number;
  operationWorkdaysUpdated: number;
  operationWorkdaysCancelled: number;
  employeeWorkdaysCreated: number;
  employeeWorkdaysReactivated: number;
  employeeWorkdaysCancelled: number;
  unchanged: number;
  absenceReconciliation?: AbsenceWorkdayReconciliationResult;
}

export interface OperationWorkdayFilters {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: OperationWorkdayStatus;
}
