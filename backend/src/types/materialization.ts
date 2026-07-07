import type { EmployeeWorkday } from "../types/workday";

export type EnsureEmployeeWorkdayOutcome =
  | { kind: "CREATED"; employeeWorkday: EmployeeWorkday }
  | { kind: "EXISTING"; employeeWorkday: EmployeeWorkday }
  | { kind: "REPAIRED"; employeeWorkday: EmployeeWorkday }
  | { kind: "REACTIVATED"; employeeWorkday: EmployeeWorkday }
  | { kind: "UNCHANGED"; employeeWorkday: EmployeeWorkday };

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
}

export interface CompanyMaterializationSummary {
  operationsProcessed: number;
  operationsFailed: number;
  results: MaterializationResult[];
  failures: Array<{ operationId: string; message: string }>;
}

export const emptyMaterializationResult = (
  operationId: string,
  rangeStart: string,
  rangeEnd: string,
): MaterializationResult => ({
  operationId,
  rangeStart,
  rangeEnd,
  operationWorkdaysCreated: 0,
  operationWorkdaysUpdated: 0,
  operationWorkdaysCancelled: 0,
  employeeWorkdaysCreated: 0,
  employeeWorkdaysReactivated: 0,
  employeeWorkdaysCancelled: 0,
  unchanged: 0,
});

export const applyEmployeeWorkdayOutcome = (
  counters: MaterializationResult,
  outcome: EnsureEmployeeWorkdayOutcome,
): void => {
  switch (outcome.kind) {
    case "CREATED":
      counters.employeeWorkdaysCreated += 1;
      break;
    case "REACTIVATED":
      counters.employeeWorkdaysReactivated += 1;
      break;
    case "REPAIRED":
      counters.unchanged += 1;
      break;
    case "EXISTING":
    case "UNCHANGED":
      counters.unchanged += 1;
      break;
    default:
      break;
  }
};
