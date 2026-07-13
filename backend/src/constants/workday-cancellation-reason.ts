export const EMPLOYEE_WORKDAY_CANCELLATION_REASONS = [
  "ASSIGNMENT",
  "SCHEDULE",
  "OPERATION",
] as const;

export type EmployeeWorkdayCancellationReason =
  (typeof EMPLOYEE_WORKDAY_CANCELLATION_REASONS)[number];

export const OPERATION_WORKDAY_CANCELLATION_REASONS = ["SCHEDULE", "OPERATION"] as const;

export type OperationWorkdayCancellationReason =
  (typeof OPERATION_WORKDAY_CANCELLATION_REASONS)[number];
