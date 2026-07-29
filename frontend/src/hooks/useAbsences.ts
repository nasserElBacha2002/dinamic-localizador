import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { absenceKeys } from "../api/absence-query-keys";
import {
  approveAbsenceRequest,
  cancelAbsenceRequest,
  createAbsenceRequest,
  getAbsenceRequestById,
  getAbsenceRequests,
  getAbsenceTypes,
  getEmployeeAbsenceBalances,
  needsInfoAbsenceRequest,
  rejectAbsenceRequest,
  resubmitAbsenceRequest,
  updateNeedsInfoAbsenceRequest,
  upsertEmployeeAbsenceBalance,
} from "../api/absences.api";
import type {
  AbsenceRequestFilters,
  CreateAbsenceRequestInput,
  UpdateNeedsInfoAbsenceRequestInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../types/absence";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

function invalidateAbsenceDomain(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null | undefined,
) {
  void queryClient.invalidateQueries({ queryKey: absenceKeys.company(companyId) });
  void queryClient.invalidateQueries({ queryKey: ["operation-workdays"] });
  void queryClient.invalidateQueries({ queryKey: ["operation-workday-detail"] });
}

export function useAbsenceTypes() {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: absenceKeys.types(companyId),
    queryFn: getAbsenceTypes,
    enabled,
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

export function useCreateAbsenceRequest() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: CreateAbsenceRequestInput) => createAbsenceRequest(input),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}

export function useApproveAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => approveAbsenceRequest(absenceRequestId),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}

export function useRejectAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (reason: string) => rejectAbsenceRequest(absenceRequestId, reason),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}

export function useNeedsInfoAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (comment: string) => needsInfoAbsenceRequest(absenceRequestId, comment),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}

export function useCancelAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => cancelAbsenceRequest(absenceRequestId),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}

export function useUpdateNeedsInfoAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: UpdateNeedsInfoAbsenceRequestInput) =>
      updateNeedsInfoAbsenceRequest(absenceRequestId, input),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}

export function useResubmitAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => resubmitAbsenceRequest(absenceRequestId),
    onSuccess: () => {
      invalidateAbsenceDomain(queryClient, companyId);
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
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: absenceKeys.balances(companyId, employeeId, variables.year),
      });
      invalidateAbsenceDomain(queryClient, companyId);
    },
  });
}
