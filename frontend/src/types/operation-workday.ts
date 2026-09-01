export type OperationWorkdayStatus = "ACTIVE" | "CANCELLED";

export interface OperationWorkdaySummary {
  id: string;
  workDate: string;
  expectedStartAt: string;
  expectedEndAt: string | null;
  status: OperationWorkdayStatus;
  scheduledEmployeesCount: number;
}

export interface OperationWorkdayFilters {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: OperationWorkdayStatus;
}
