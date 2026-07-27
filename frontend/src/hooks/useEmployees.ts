import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
} from "../api/employees.api";
import type { Employee, EmployeeFilters, UpdateEmployeeInput } from "../types/employee";
import type { DeactivateEmployeeInput } from "../types/employee-deactivation";
import { invalidateEmployeeScopedQueries } from "../queryKeys/invalidation";
import { employeeKeys } from "../queryKeys/employees";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useEmployees(filters: EmployeeFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: employeeKeys.list(companyId, filters),
    queryFn: () => getEmployees(filters),
    enabled,
  });
}

export function useEmployee(employeeId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(employeeId));

  return useQuery({
    queryKey: employeeKeys.detail(companyId, employeeId),
    queryFn: () => getEmployeeById(employeeId!),
    enabled,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      void invalidateEmployeeScopedQueries(queryClient, companyId);
    },
  });
}

export function useUpdateEmployee(employeeId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateEmployeeInput) => updateEmployee(employeeId, input),
    onSuccess: (updated: Employee) => {
      queryClient.setQueryData(employeeKeys.detail(companyId, employeeId), updated);
      void invalidateEmployeeScopedQueries(queryClient, companyId);
    },
  });
}

export function useDeactivateEmployee(employeeId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: DeactivateEmployeeInput) => deactivateEmployee(employeeId, input),
    onSuccess: (updated: Employee) => {
      queryClient.setQueryData(employeeKeys.detail(companyId, employeeId), updated);
      void invalidateEmployeeScopedQueries(queryClient, companyId);
    },
  });
}
