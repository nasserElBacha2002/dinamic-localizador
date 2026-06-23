export const EMPLOYEE_TYPES = ["fijo", "eventual"] as const;

export type EmployeeType = (typeof EMPLOYEE_TYPES)[number];
