import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
} from "../api/employees.api";
import type { EmployeeFilters, UpdateEmployeeInput } from "../types/employee";

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: ["employees", filters],
    queryFn: () => getEmployees(filters),
    retry: 1,
  });
}

export function useEmployee(employeeId?: string) {
  return useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployeeById(employeeId!),
    enabled: Boolean(employeeId),
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
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
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
