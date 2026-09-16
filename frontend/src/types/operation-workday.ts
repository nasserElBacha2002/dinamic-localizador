export type OperationWorkdayStatus = "ACTIVE" | "CANCELLED";

export interface OperationWorkdaySummary {
  id: string;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  status: OperationWorkdayStatus;
  scheduledEmployeesCount: number;
  /** Present for MULTI_SHIFT materialized workdays; null/omitted for SINGLE. */
  operationShiftId?: string | null;
  shiftCodeSnapshot?: string | null;
  shiftNameSnapshot?: string | null;
}

export interface OperationWorkdayFilters {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: OperationWorkdayStatus;
}
