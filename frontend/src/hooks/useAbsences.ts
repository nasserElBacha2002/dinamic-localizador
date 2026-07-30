import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { absenceBalanceKeys, absenceKeys } from "../api/absence-query-keys";
import {
  adjustEmployeeAbsenceBalance,
  approveAbsenceRequest,
  cancelAbsenceRequest,
  createAbsenceRequest,
  getAbsenceOperationalImpact,
  getAbsenceRequestById,
  getAbsenceRequests,
  getAbsenceTypes,
  getEmployeeAbsenceBalanceMovements,
  getEmployeeAbsenceBalances,
  needsInfoAbsenceRequest,
  rejectAbsenceRequest,
  resolveAbsenceOperationalConflict,
  resubmitAbsenceRequest,
  updateNeedsInfoAbsenceRequest,
  upsertEmployeeAbsenceBalance,
  updateAbsenceType,
} from "../api/absences.api";
import type {
  AbsenceAttachmentPolicy,
  AbsenceBalanceMovementsFilters,
  AbsenceRequestFilters,
  AdjustEmployeeAbsenceBalanceInput,
  CreateAbsenceRequestInput,
  UpdateNeedsInfoAbsenceRequestInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../types/absence";
import type { ResolveAbsenceOperationalConflictInput } from "../types/absence-operational-impact";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

function invalidateAbsenceDomain(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null | undefined,
) {
  if (!companyId) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: absenceKeys.company(companyId) });
  // Prefix matches operationWorkdayKeys.list/detail for this company only.
  void queryClient.invalidateQueries({ queryKey: ["operation-workdays", companyId] });
  void queryClient.invalidateQueries({ queryKey: ["operation-workday-detail", companyId] });
}

type MutationCompanyContext = { companyId: string | undefined };

export function useAbsenceTypes() {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: absenceKeys.types(companyId),
    queryFn: getAbsenceTypes,
    enabled,
  });
}

export function useUpdateAbsenceType() {
  const { companyId } = useOperationalQueryEnabled();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      dayCountingMode?: "CALENDAR_DAYS" | "BUSINESS_DAYS";
      calendarId?: string | null;
      attachmentPolicy?: AbsenceAttachmentPolicy;
    }) => updateAbsenceType(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: absenceKeys.types(companyId) });
    },
  });
}

export function useAbsenceRequests(filters: AbsenceRequestFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: absenceKeys.list(companyId, filters),
    queryFn: () => getAbsenceRequests(filters),
    enabled,
  });
}

export function useAbsenceRequest(absenceRequestId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(absenceRequestId));

  return useQuery({
    queryKey: absenceKeys.detail(companyId, absenceRequestId ?? ""),
    queryFn: () => getAbsenceRequestById(absenceRequestId!),
    enabled,
  });
}

export function useAbsenceOperationalImpact(absenceRequestId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(absenceRequestId));

  return useQuery({
    queryKey: absenceKeys.operationalImpact(companyId, absenceRequestId ?? ""),
    queryFn: () => getAbsenceOperationalImpact(absenceRequestId!),
    enabled,
  });
}

export function useResolveAbsenceOperationalConflict(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: {
      conflictId: string;
    } & ResolveAbsenceOperationalConflictInput) =>
      resolveAbsenceOperationalConflict(absenceRequestId, input.conflictId, {
        resolutionCode: input.resolutionCode,
        resolutionReason: input.resolutionReason,
        replacementEmployeeId: input.replacementEmployeeId,
        commandId: input.commandId,
      }),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
      if (context?.companyId) {
        void queryClient.invalidateQueries({
          queryKey: absenceKeys.operationalImpact(context.companyId, absenceRequestId),
        });
      }
    },
  });
}

export function useCreateAbsenceRequest() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: CreateAbsenceRequestInput) => createAbsenceRequest(input),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useApproveAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => approveAbsenceRequest(absenceRequestId),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useRejectAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (reason: string) => rejectAbsenceRequest(absenceRequestId, reason),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useNeedsInfoAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (comment: string) => needsInfoAbsenceRequest(absenceRequestId, comment),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useCancelAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => cancelAbsenceRequest(absenceRequestId),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useUpdateNeedsInfoAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: UpdateNeedsInfoAbsenceRequestInput) =>
      updateNeedsInfoAbsenceRequest(absenceRequestId, input),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useResubmitAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => resubmitAbsenceRequest(absenceRequestId),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidateAbsenceDomain(queryClient, context?.companyId);
    },
  });
}

export function useEmployeeAbsenceBalances(employeeId?: string, year?: number) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(employeeId && year));

  return useQuery({
    queryKey: absenceKeys.balances(companyId, employeeId ?? "", year ?? 0),
    queryFn: () => getEmployeeAbsenceBalances(employeeId!, year!),
    enabled,
  });
}

export function useUpsertEmployeeAbsenceBalance(employeeId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: UpsertEmployeeAbsenceBalanceInput & { absenceTypeId: string }) =>
      upsertEmployeeAbsenceBalance(employeeId, input.absenceTypeId, {
        year: input.year,
        totalDays: input.totalDays,
        notes: input.notes,
      }),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, variables, context) => {
      const scopedCompanyId = context?.companyId;
      if (scopedCompanyId) {
        void queryClient.invalidateQueries({
          queryKey: absenceBalanceKeys.summary(scopedCompanyId, employeeId, variables.year),
        });
      }
      invalidateAbsenceDomain(queryClient, scopedCompanyId);
    },
  });
}

export function useEmployeeAbsenceBalanceMovements(
  employeeId: string | undefined,
  absenceTypeId: string | undefined,
  filters: AbsenceBalanceMovementsFilters,
  enabled = true,
) {
  const { companyId, enabled: operationalEnabled } = useOperationalQueryEnabled(
    Boolean(employeeId && absenceTypeId && enabled),
  );

  return useQuery({
    queryKey: absenceBalanceKeys.movements(
      companyId,
      employeeId ?? "",
      absenceTypeId ?? "",
      filters as Record<string, unknown>,
    ),
    queryFn: () => getEmployeeAbsenceBalanceMovements(employeeId!, absenceTypeId!, filters),
    enabled: operationalEnabled,
  });
}

export function useAdjustEmployeeAbsenceBalance(employeeId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: AdjustEmployeeAbsenceBalanceInput & { absenceTypeId: string }) =>
      adjustEmployeeAbsenceBalance(employeeId, input.absenceTypeId, {
        year: input.year,
        quantity: input.quantity,
        operation: input.operation,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      }),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, variables, context) => {
      const scopedCompanyId = context?.companyId;
      if (scopedCompanyId) {
        void queryClient.invalidateQueries({
          queryKey: absenceBalanceKeys.summary(scopedCompanyId, employeeId, variables.year),
        });
        void queryClient.invalidateQueries({
          queryKey: absenceBalanceKeys.movements(
            scopedCompanyId,
            employeeId,
            variables.absenceTypeId,
            { year: variables.year },
          ),
        });
      }
      invalidateAbsenceDomain(queryClient, scopedCompanyId);
    },
  });
}
