import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateWorkTeamInput,
  UpdateWorkTeamInput,
  WorkTeam,
  WorkTeamAssignConfirmResult,
  WorkTeamAssignPreviewResult,
  WorkTeamDetail,
  WorkTeamFilters,
  WorkTeamMember,
  WorkTeamUsageRecord,
} from "../types/work-team";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getWorkTeams(
  filters: WorkTeamFilters = {},
): Promise<PaginatedResponse<WorkTeam>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<WorkTeam>>("work-teams", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getWorkTeamById(id: string): Promise<WorkTeamDetail> {
  const { data } = await scopedApiClient.get<SingleResponse<WorkTeamDetail>>(`work-teams/${id}`);
  return data.data;
}

export async function createWorkTeam(input: CreateWorkTeamInput): Promise<WorkTeamDetail> {
  const { data } = await scopedApiClient.post<SingleResponse<WorkTeamDetail>>("work-teams", input);
  return data.data;
}

export async function updateWorkTeam(id: string, input: UpdateWorkTeamInput): Promise<WorkTeamDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<WorkTeamDetail>>(
    `work-teams/${id}`,
    input,
  );
  return data.data;
}

export async function activateWorkTeam(id: string): Promise<WorkTeamDetail> {
  const { data } = await scopedApiClient.post<SingleResponse<WorkTeamDetail>>(
    `work-teams/${id}/activate`,
  );
  return data.data;
}

export async function deactivateWorkTeam(id: string): Promise<WorkTeamDetail> {
  const { data } = await scopedApiClient.post<SingleResponse<WorkTeamDetail>>(
    `work-teams/${id}/deactivate`,
  );
  return data.data;
}

export async function replaceWorkTeamMembers(
  id: string,
  employeeIds: string[],
): Promise<{ data: WorkTeamMember[] }> {
  const { data } = await scopedApiClient.put<{ data: WorkTeamMember[] }>(
    `work-teams/${id}/members`,
    { employeeIds },
  );
  return data;
}

export async function getWorkTeamUsage(
  id: string,
  filters: { page?: number; limit?: number } = {},
): Promise<PaginatedResponse<WorkTeamUsageRecord>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<WorkTeamUsageRecord>>(
    `work-teams/${id}/usage`,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function previewWorkTeamAssignment(
  operationId: string,
  input: { workTeamIds: string[]; validFrom?: string; validUntil?: string | null },
): Promise<WorkTeamAssignPreviewResult> {
  const { data } = await scopedApiClient.post<SingleResponse<WorkTeamAssignPreviewResult>>(
    `operations/${operationId}/work-teams/assign-preview`,
    input,
  );
  return data.data;
}

export async function confirmWorkTeamAssignment(
  operationId: string,
  previewToken: string,
): Promise<WorkTeamAssignConfirmResult> {
  const { data } = await scopedApiClient.post<SingleResponse<WorkTeamAssignConfirmResult>>(
    `operations/${operationId}/work-teams/assign`,
    { previewToken },
  );
  return data.data;
}

export async function getWorkTeamAssignmentBatch(batchId: string) {
  const { data } = await scopedApiClient.get<SingleResponse<unknown>>(
    `work-team-assignment-batches/${batchId}`,
  );
  return data.data;
}
