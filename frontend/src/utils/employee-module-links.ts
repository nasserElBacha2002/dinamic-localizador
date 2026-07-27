import { serializeIdList } from "./multi-value-filter";

/** List routes that accept an employee filter via `employeeIds`. */
export const EMPLOYEE_ATTENDANCE_LIST_PATH = "/attendance";
export const EMPLOYEE_ABSENCES_LIST_PATH = "/absences";
export const EMPLOYEE_STATISTICS_PATH = "/statistics";

export type EmployeeModuleLinkTarget = "attendance" | "absences" | "statistics";

/**
 * Build a deep-link into a list/report module with the employee pre-selected.
 * Uses the existing `employeeIds` stringList URL contract (not a new collaboratorId).
 */
export function buildEmployeeModulePath(
  target: EmployeeModuleLinkTarget,
  employeeId: string,
): string {
  const id = employeeId.trim();
  const serialized = serializeIdList(id ? [id] : []);
  if (!serialized) {
    switch (target) {
      case "attendance":
        return EMPLOYEE_ATTENDANCE_LIST_PATH;
      case "absences":
        return EMPLOYEE_ABSENCES_LIST_PATH;
      case "statistics":
        return EMPLOYEE_STATISTICS_PATH;
    }
  }

  const params = new URLSearchParams();
  params.set("employeeIds", serialized);

  switch (target) {
    case "attendance":
      return `${EMPLOYEE_ATTENDANCE_LIST_PATH}?${params.toString()}`;
    case "absences":
      // List default is PENDING; show all statuses when jumping from the employee profile.
      params.set("status", "all");
      return `${EMPLOYEE_ABSENCES_LIST_PATH}?${params.toString()}`;
    case "statistics":
      params.set("tab", "employee");
      return `${EMPLOYEE_STATISTICS_PATH}?${params.toString()}`;
  }
}

export function buildEmployeeAttendancePath(employeeId: string): string {
  return buildEmployeeModulePath("attendance", employeeId);
}

export function buildEmployeeAbsencesPath(employeeId: string): string {
  return buildEmployeeModulePath("absences", employeeId);
}

export function buildEmployeeStatisticsPath(employeeId: string): string {
  return buildEmployeeModulePath("statistics", employeeId);
}
