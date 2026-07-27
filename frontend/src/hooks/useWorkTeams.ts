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
import { workTeamKeys } from "../queryKeys/work-teams";
import { invalidateOperationScopedQueries } from "./useOperations";
import { isRecurringWorkdaySyncError } from "../utils/errors";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export async function invalidateOperationAssignmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | undefined,
  operationId: string | undefined,
): Promise<void> {
  await invalidateOperationScopedQueries(queryClient, companyId, operationId);
}

export function useWorkTeams(filters: WorkTeamFilters, extraEnabled = true) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled(extraEnabled);

  const query = useQuery({
    queryKey: workTeamKeys.list(companyId, filters),
    queryFn: () => getWorkTeams(filters),
    enabled,
    retry: 1,
  });

  return { ...query, companyId, isCompanyLoading };
}

export function useWorkTeam(workTeamId?: string) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled(Boolean(workTeamId));

  const query = useQuery({
    queryKey: workTeamKeys.detail(companyId, workTeamId),
    queryFn: () => getWorkTeamById(workTeamId!),
    enabled,
  });

  return { ...query, companyId, isCompanyLoading };
}

export function useWorkTeamUsage(workTeamId: string, filters: { page?: number; limit?: number }) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled(Boolean(workTeamId));

  const query = useQuery({
    queryKey: workTeamKeys.usage(companyId, workTeamId, filters),
    queryFn: () => getWorkTeamUsage(workTeamId, filters),
    enabled,
  });

  return { ...query, companyId, isCompanyLoading };
}

export function useCreateWorkTeam() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: CreateWorkTeamInput) => createWorkTeam(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workTeamKeys.lists(companyId) });
    },
  });
}

export function useUpdateWorkTeam(workTeamId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: UpdateWorkTeamInput) => updateWorkTeam(workTeamId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workTeamKeys.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: workTeamKeys.details(companyId) }),
      ]);
    },
  });
}

export function useReplaceWorkTeamMembers(workTeamId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (employeeIds: string[]) => replaceWorkTeamMembers(workTeamId, employeeIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workTeamKeys.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: workTeamKeys.details(companyId) }),
      ]);
    },
  });
}

export function useActivateWorkTeam() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: activateWorkTeam,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workTeamKeys.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: workTeamKeys.details(companyId) }),
      ]);
    },
  });
}

export function useDeactivateWorkTeam() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: deactivateWorkTeam,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workTeamKeys.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: workTeamKeys.details(companyId) }),
      ]);
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
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (previewToken: string) => confirmWorkTeamAssignment(operationId, previewToken),
    onSettled: async (_data, error) => {
      if (error && !isRecurringWorkdaySyncError(error)) {
        return;
      }
      await invalidateOperationAssignmentQueries(queryClient, companyId, operationId);
    },
  });
}
