import { useQuery } from "@tanstack/react-query";
import {
  getEmployeeOperations,
  type EmployeeOperationsFilters,
} from "../api/employees.api";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useEmployeeOperations(
  employeeId: string | undefined,
  filters: EmployeeOperationsFilters,
  enabled = true,
) {
  const { companyId, enabled: scopeEnabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: ["employees", companyId, employeeId, "operations", filters],
    queryFn: ({ signal }) =>
      getEmployeeOperations(employeeId!, filters, { signal }),
    enabled: scopeEnabled && enabled && Boolean(employeeId),
  });
}
