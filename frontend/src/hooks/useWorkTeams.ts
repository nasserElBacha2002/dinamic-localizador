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
import { isRecurringWorkdaySyncError } from "../utils/errors";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export async function invalidateOperationAssignmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["operation"] }),
    queryClient.invalidateQueries({ queryKey: ["operation-employees"] }),
    queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["operation-workdays"] }),
    queryClient.invalidateQueries({ queryKey: ["operation-workday-detail"] }),
  ]);
}

export function useWorkTeams(filters: WorkTeamFilters, extraEnabled = true) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled(extraEnabled);

  const query = useQuery({
    queryKey: ["work-teams", companyId, filters],
    queryFn: () => getWorkTeams(filters),
    enabled,
    retry: 1,
  });

  return { ...query, companyId, isCompanyLoading };
}

export function useWorkTeam(workTeamId?: string) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled(Boolean(workTeamId));

  const query = useQuery({
    queryKey: ["work-team", companyId, workTeamId],
    queryFn: () => getWorkTeamById(workTeamId!),
    enabled,
  });

  return { ...query, companyId, isCompanyLoading };
}

export function useWorkTeamUsage(workTeamId: string, filters: { page?: number; limit?: number }) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled(Boolean(workTeamId));

  const query = useQuery({
    queryKey: ["work-team-usage", companyId, workTeamId, filters],
    queryFn: () => getWorkTeamUsage(workTeamId, filters),
    enabled,
  });

  return { ...query, companyId, isCompanyLoading };
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
      queryClient.invalidateQueries({ queryKey: ["work-team"] });
    },
  });
}

export function useReplaceWorkTeamMembers(workTeamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (employeeIds: string[]) => replaceWorkTeamMembers(workTeamId, employeeIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-teams"] });
      queryClient.invalidateQueries({ queryKey: ["work-team"] });
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
    onSettled: async (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      await invalidateOperationAssignmentQueries(queryClient);
    },
  });
}
