export type OperationWorkdayStatus = "ACTIVE" | "CANCELLED";

export interface OperationWorkdaySummary {
  id: string;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  status: OperationWorkdayStatus;
  expectedEmployeesCount: number;
}

export interface OperationWorkdayEmployeeSummary {
  employeeId: string;
  employeeName: string;
  expectationStatus: string;
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
  employeeWorkdaysCancelled: number;
  unchanged: number;
}

export interface OperationWorkdayFilters {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: OperationWorkdayStatus;
}
