import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAbsenceRequest,
  cancelAbsenceRequest,
  createAbsenceRequest,
  getAbsenceRequestById,
  getAbsenceRequests,
  getAbsenceTypes,
  needsInfoAbsenceRequest,
  rejectAbsenceRequest,
} from "../api/absences.api";
import type { AbsenceRequestFilters, CreateAbsenceRequestInput } from "../types/absence";

export function useAbsenceTypes() {
  return useQuery({
    queryKey: ["absence-types"],
    queryFn: getAbsenceTypes,
  });
}

export function useAbsenceRequests(filters: AbsenceRequestFilters) {
  return useQuery({
    queryKey: ["absence-requests", filters],
    queryFn: () => getAbsenceRequests(filters),
  });
}

export function useAbsenceRequest(absenceRequestId?: string) {
  return useQuery({
    queryKey: ["absence-request", absenceRequestId],
    queryFn: () => getAbsenceRequestById(absenceRequestId!),
    enabled: Boolean(absenceRequestId),
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
