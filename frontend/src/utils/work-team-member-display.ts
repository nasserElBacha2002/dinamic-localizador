import type { Employee } from "../types/employee";
import { activeStatusLabel, employeeTypeLabels } from "./labels";

export interface SelectedEmployeeDisplay {
  name: string;
  secondary: string;
  isInactive: boolean;
  isLoading: boolean;
  isUnavailable: boolean;
}

export function buildEmployeeByIdMap(employees: Employee[]): Map<string, Employee> {
  return new Map(employees.map((employee) => [employee.id, employee]));
}

export function resolveSelectedEmployeeDisplay(
  employeeId: string,
  employeeById: Map<string, Employee>,
  loadingIds: ReadonlySet<string>,
  unavailableIds: ReadonlySet<string>,
): SelectedEmployeeDisplay {
  if (unavailableIds.has(employeeId)) {
    return {
      name: "Colaborador no disponible",
      secondary: "",
      isInactive: false,
      isLoading: false,
      isUnavailable: true,
    };
  }

  const employee = employeeById.get(employeeId);
  if (!employee || loadingIds.has(employeeId)) {
    return {
      name: "Cargando colaborador...",
      secondary: "",
      isInactive: false,
      isLoading: true,
      isUnavailable: false,
    };
  }

  const isInactive = !employee.active;
  return {
    name: employee.name,
    secondary: `${employeeTypeLabels[employee.employeeType]}${isInactive ? ` · ${activeStatusLabel(false)}` : ""}`,
    isInactive,
    isLoading: false,
    isUnavailable: false,
  };
}

export function getMissingSelectedEmployeeIds(
  selectedEmployeeIds: string[],
  employeeById: Map<string, Employee>,
  unavailableIds: ReadonlySet<string>,
): string[] {
  return selectedEmployeeIds.filter(
    (employeeId) => !employeeById.has(employeeId) && !unavailableIds.has(employeeId),
  );
}
