import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignEmployeeToOperation,
  cancelOperation,
  cancelOperationAssignment,
  createOperation,
  endOperationAssignment,
  getOperations,
  getOperationAttendanceSummary,
  getOperationById,
  getOperationEmployees,
  getOperationWorkdayDetail,
  getOperationWorkdays,
  materializeOperationWorkdays,
  updateOperation,
} from "../api/operations.api";
import type {
  OperationFilters,
  UpdateOperationInput,
} from "../types/operation";
import type { OperationAttendanceSummaryFilters } from "../types/operation-attendance-summary";
import type { OperationWorkdayFilters } from "../types/operation-workday";
import { isRecurringWorkdaySyncError } from "../utils/errors";
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
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
    },
  });
}

export function useUpdateOperation(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOperationInput) => updateOperation(operationId, input),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
    },
  });
}

export function useCancelOperation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelOperation,
    onSettled: (_data, error, operationId) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation", undefined, operationId] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
    },
  });
}

export function useAssignOperationEmployee(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { employeeId: string; validFrom?: string; validUntil?: string | null }) =>
      assignEmployeeToOperation(operationId, input),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
    },
  });
}

export function useCancelOperationAssignment(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignmentId: string) =>
      cancelOperationAssignment(operationId, assignmentId),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
    },
  });
}

export function useEndOperationAssignment(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { assignmentId: string; effectiveDate: string }) =>
      endOperationAssignment(operationId, input.assignmentId, input.effectiveDate),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-employees"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
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

export function useOperationWorkdays(operationId?: string, filters: OperationWorkdayFilters = {}) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: ["operation-workdays", companyId, operationId, filters],
    queryFn: () => getOperationWorkdays(operationId!, filters),
    enabled,
  });
}

export function useOperationWorkdayDetail(
  operationId?: string,
  workdayId?: string,
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(
    Boolean(operationId && workdayId && extraEnabled),
  );

  return useQuery({
    queryKey: ["operation-workday-detail", companyId, operationId, workdayId],
    queryFn: () => getOperationWorkdayDetail(operationId!, workdayId!),
    enabled,
  });
}

export function useMaterializeOperationWorkdays(operationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => materializeOperationWorkdays(operationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-employees"] });
    },
  });
}
