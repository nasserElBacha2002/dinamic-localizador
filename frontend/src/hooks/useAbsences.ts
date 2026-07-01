import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  upsertEmployeeAbsenceBalance,
} from "../api/absences.api";
import type {
  AbsenceRequestFilters,
  CreateAbsenceRequestInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../types/absence";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useAbsenceTypes() {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: ["absence-types", companyId],
    queryFn: () => getAbsenceTypes(companyId),
    enabled,
  });
}

export function useAbsenceRequests(filters: AbsenceRequestFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: ["absence-requests", companyId, filters],
    queryFn: () => getAbsenceRequests(filters, companyId),
    enabled,
  });
}

export function useAbsenceRequest(absenceRequestId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(absenceRequestId));

  return useQuery({
    queryKey: ["absence-request", companyId, absenceRequestId],
    queryFn: () => getAbsenceRequestById(absenceRequestId!, companyId),
    enabled,
  });
}

export function useCreateAbsenceRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAbsenceRequestInput) => createAbsenceRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absence-requests"] });
    },
  });
}

export function useApproveAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => approveAbsenceRequest(absenceRequestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["absence-request", absenceRequestId] });
    },
  });
}

export function useRejectAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => rejectAbsenceRequest(absenceRequestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["absence-request", absenceRequestId] });
    },
  });
}

export function useNeedsInfoAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (comment: string) => needsInfoAbsenceRequest(absenceRequestId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["absence-request", absenceRequestId] });
    },
  });
}

export function useCancelAbsenceRequest(absenceRequestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelAbsenceRequest(absenceRequestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["absence-request", absenceRequestId] });
    },
  });
}

export function useEmployeeAbsenceBalances(employeeId?: string, year?: number) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(employeeId && year));

  return useQuery({
    queryKey: ["employee-absence-balances", companyId, employeeId, year],
    queryFn: () => getEmployeeAbsenceBalances(employeeId!, year!, companyId),
    enabled,
  });
}

export function useUpsertEmployeeAbsenceBalance(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertEmployeeAbsenceBalanceInput & { absenceTypeId: string }) =>
      upsertEmployeeAbsenceBalance(employeeId, input.absenceTypeId, {
        year: input.year,
        totalDays: input.totalDays,
        notes: input.notes,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["employee-absence-balances", employeeId, variables.year],
      });
      queryClient.invalidateQueries({ queryKey: ["absence-requests"] });
      queryClient.invalidateQueries({ queryKey: ["absence-request"] });
    },
  });
}
