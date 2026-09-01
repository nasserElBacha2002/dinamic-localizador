import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignEmployeeToOperation,
  assignEmployeesBatchToOperation,
  cancelOperation,
  cancelOperationAssignment,
  createOperation,
  endOperationAssignment,
  getOperations,
  getOperationAttendanceSummary,
  getOperationById,
  getOperationEmployees,
  getOperationWorkdays,
  reactivateOperation,
  updateOperation,
} from "../api/operations.api";
import type {
  OperationFilters,
  UpdateOperationInput,
} from "../types/operation";
import type { OperationAttendanceSummaryFilters } from "../types/operation-attendance-summary";
import type { OperationWorkdayFilters } from "../types/operation-workday";
import {
  operationAttendanceKeys,
  operationEmployeeKeys,
  operationKeys,
  operationWorkdayKeys,
} from "../queryKeys/operations";
import { isRecurringWorkdaySyncError } from "../utils/errors";
import { operationRecommendationKeys } from "./useOperationRecommendations";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

/**
 * Invalidates every query scoped to a single operation of the active company.
 * Uses scoped prefixes so other companies and operations stay cached.
 * Includes AI recommendations (team context changes after assign/cancel/end).
 */
export async function invalidateOperationScopedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | undefined,
  operationId: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: operationKeys.detail(companyId, operationId) }),
    queryClient.invalidateQueries({ queryKey: operationEmployeeKeys.list(companyId, operationId) }),
    queryClient.invalidateQueries({
      queryKey: operationAttendanceKeys.summary(companyId, operationId),
    }),
    queryClient.invalidateQueries({ queryKey: operationWorkdayKeys.list(companyId, operationId) }),
    queryClient.invalidateQueries({
      queryKey: [
        ...operationRecommendationKeys.company(companyId),
        "employees",
        operationId ?? "none",
      ],
    }),
    queryClient.invalidateQueries({
      queryKey: [
        ...operationRecommendationKeys.company(companyId),
        "team",
        operationId ?? "none",
      ],
    }),
  ]);
}

export function useOperations(filters: OperationFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: operationKeys.list(companyId, filters),
    queryFn: () => getOperations(filters),
    enabled,
    retry: 1,
  });
}

export function useOperation(operationId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: operationKeys.detail(companyId, operationId),
    queryFn: () => getOperationById(operationId!),
    enabled,
  });
}

export function useOperationEmployees(operationId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: operationEmployeeKeys.list(companyId, operationId),
    queryFn: () => getOperationEmployees(operationId!),
    enabled,
  });
}

export function useCreateOperation() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: createOperation,
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
    },
  });
}

export function useUpdateOperation(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateOperationInput) => updateOperation(operationId, input),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
      queryClient.invalidateQueries({ queryKey: operationKeys.detail(companyId, operationId) });
      queryClient.invalidateQueries({
        queryKey: operationWorkdayKeys.list(companyId, operationId),
      });
    },
  });
}

export function useCancelOperation() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: cancelOperation,
    onSettled: (_data, error, operationId) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
      queryClient.invalidateQueries({ queryKey: operationKeys.detail(companyId, operationId) });
      queryClient.invalidateQueries({
        queryKey: operationWorkdayKeys.list(companyId, operationId),
      });
    },
  });
}

export function useReactivateOperation() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: reactivateOperation,
    onSettled: (_data, error, operationId) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
      void invalidateOperationScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useAssignOperationEmployee(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: { employeeId: string; validFrom?: string; validUntil?: string | null }) =>
      assignEmployeeToOperation(operationId, input),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      void invalidateOperationScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useAssignOperationEmployeesBatch(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: {
      employeeIds: string[];
      validFrom?: string;
      validUntil?: string | null;
    }) => assignEmployeesBatchToOperation(operationId, input),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      void invalidateOperationScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useCancelOperationAssignment(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (assignmentId: string) =>
      cancelOperationAssignment(operationId, assignmentId),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      void invalidateOperationScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useEndOperationAssignment(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: { assignmentId: string; effectiveDate: string }) =>
      endOperationAssignment(operationId, input.assignmentId, input.effectiveDate),
    onSettled: (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      void invalidateOperationScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useOperationAttendanceSummary(
  operationId?: string,
  filters: OperationAttendanceSummaryFilters = {},
) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: operationAttendanceKeys.summary(companyId, operationId, filters),
    queryFn: () => getOperationAttendanceSummary(operationId!, filters),
    enabled,
    refetchInterval: enabled ? 30000 : false,
  });
}

export function useOperationWorkdays(operationId?: string, filters: OperationWorkdayFilters = {}) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(operationId));

  return useQuery({
    queryKey: operationWorkdayKeys.list(companyId, operationId, filters),
    queryFn: () => getOperationWorkdays(operationId!, filters),
    enabled,
  });
}
