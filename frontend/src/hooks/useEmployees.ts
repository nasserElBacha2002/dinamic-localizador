import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
} from "../api/employees.api";
import type { EmployeeFilters, UpdateEmployeeInput } from "../types/employee";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useEmployees(filters: EmployeeFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["employees", companyId, filters],
    queryFn: () => getEmployees(filters),
    enabled,
    retry: 1,
  });
}

export function useEmployee(employeeId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(employeeId));

  return useQuery({
    queryKey: ["employee", companyId, employeeId],
    queryFn: () => getEmployeeById(employeeId!),
    enabled,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useUpdateEmployee(employeeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateEmployeeInput) => updateEmployee(employeeId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee"] });
    },
  });
}

export function useDeactivateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
