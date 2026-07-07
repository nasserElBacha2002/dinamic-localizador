export const OPERATION_WORKDAY_STATUSES = ["ACTIVE", "CANCELLED"] as const;

export type OperationWorkdayStatus = (typeof OPERATION_WORKDAY_STATUSES)[number];

export const EMPLOYEE_WORKDAY_EXPECTATION_STATUSES = [
  "EXPECTED",
  "JUSTIFIED",
  "CANCELLED",
] as const;

export type EmployeeWorkdayExpectationStatus =
  (typeof EMPLOYEE_WORKDAY_EXPECTATION_STATUSES)[number];
