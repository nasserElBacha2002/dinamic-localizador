import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignEmployeeToOperation,
  cancelOperation,
  createOperation,
  getOperations,
  getOperationAttendanceSummary,
  getOperationById,
  getOperationEmployees,
  unassignEmployeeFromOperation,
  updateOperation,
} from "../api/operations.api";
import type {
  OperationFilters,
  UpdateOperationInput,
} from "../types/operation";
import type { OperationAttendanceSummaryFilters } from "../types/operation-attendance-summary";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useOperations(filters: OperationFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["operations", companyId, filters],
    queryFn: () => getOperations(filters),
    enabled,
    retry: 1,
  });
}

export function useOperation(operationId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: ["operation", companyId, operationId],
    queryFn: () => getOperationById(operationId!),
    enabled,
  });
}

export function useOperationEmployees(operationId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: ["operation-employees", companyId, operationId],
    queryFn: () => getOperationEmployees(operationId!),
    enabled,
  });
}

export function useCreateOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOperation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations"] });
    },
  });
}

export function useUpdateOperation(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOperationInput) => updateOperation(operationId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation"] });
    },
  });
}

export function useCancelOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelOperation,
    onSuccess: (_data, operationId) => {
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation", operationId] });
    },
  });
}

export function useAssignOperationEmployee(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (employeeId: string) => assignEmployeeToOperation(operationId, employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
    },
  });
}

export function useUnassignOperationEmployee(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (employeeId: string) => unassignEmployeeFromOperation(operationId, employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
    },
  });
}

export function useOperationAttendanceSummary(
  operationId?: string,
  filters: OperationAttendanceSummaryFilters = {},
) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: ["operation-attendance-summary", companyId, operationId, filters],
    queryFn: () => getOperationAttendanceSummary(operationId!, filters),
    enabled,
    refetchInterval: enabled ? 30000 : false,
  });
}
