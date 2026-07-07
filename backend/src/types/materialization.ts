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

export interface CompanyMaterializationSummary {
  operationsProcessed: number;
  operationsFailed: number;
  results: MaterializationResult[];
  failures: Array<{ operationId: string; message: string }>;
}
