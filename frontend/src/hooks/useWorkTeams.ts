import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateWorkTeam,
  confirmWorkTeamAssignment,
  createWorkTeam,
  deactivateWorkTeam,
  getWorkTeamById,
  getWorkTeams,
  getWorkTeamUsage,
  previewWorkTeamAssignment,
  replaceWorkTeamMembers,
  updateWorkTeam,
} from "../api/work-teams.api";
import type { CreateWorkTeamInput, UpdateWorkTeamInput, WorkTeamFilters } from "../types/work-team";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useWorkTeams(filters: WorkTeamFilters, extraEnabled = true) {
  const { enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["work-teams", filters],
    queryFn: () => getWorkTeams(filters),
    enabled,
    retry: 1,
  });
}

export function useWorkTeam(workTeamId?: string) {
  const { enabled } = useOperationalQueryEnabled(Boolean(workTeamId));

  return useQuery({
    queryKey: ["work-team", workTeamId],
    queryFn: () => getWorkTeamById(workTeamId!),
    enabled,
  });
}

export function useWorkTeamUsage(workTeamId: string, filters: { page?: number; limit?: number }) {
  const { enabled } = useOperationalQueryEnabled(Boolean(workTeamId));

  return useQuery({
    queryKey: ["work-team-usage", workTeamId, filters],
    queryFn: () => getWorkTeamUsage(workTeamId, filters),
    enabled,
  });
}

export function useCreateWorkTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkTeamInput) => createWorkTeam(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-teams"] });
    },
  });
}

export function useUpdateWorkTeam(workTeamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkTeamInput) => updateWorkTeam(workTeamId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-teams"] });
      queryClient.invalidateQueries({ queryKey: ["work-team", workTeamId] });
    },
  });
}

export function useReplaceWorkTeamMembers(workTeamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (employeeIds: string[]) => replaceWorkTeamMembers(workTeamId, employeeIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-teams"] });
      queryClient.invalidateQueries({ queryKey: ["work-team", workTeamId] });
    },
  });
}

export function useActivateWorkTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activateWorkTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-teams"] });
      queryClient.invalidateQueries({ queryKey: ["work-team"] });
    },
  });
}

export function useDeactivateWorkTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateWorkTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-teams"] });
      queryClient.invalidateQueries({ queryKey: ["work-team"] });
    },
  });
}

export function usePreviewWorkTeamAssignment(operationId: string) {
  return useMutation({
    mutationFn: (input: { workTeamIds: string[]; validFrom?: string; validUntil?: string | null }) =>
      previewWorkTeamAssignment(operationId, input),
  });
}

export function useConfirmWorkTeamAssignment(operationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previewToken: string) => confirmWorkTeamAssignment(operationId, previewToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operation-employees", operationId] });
      queryClient.invalidateQueries({ queryKey: ["operation", operationId] });
      queryClient.invalidateQueries({ queryKey: ["operation-workforce", operationId] });
    },
  });
}
