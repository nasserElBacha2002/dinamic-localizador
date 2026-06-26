import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AbsenceRequestDetail,
  AbsenceRequestFilters,
  AbsenceRequestListItem,
  AbsenceType,
  CreateAbsenceRequestInput,
} from "../types/absence";
import { apiClient, buildParams } from "./client";

export async function getAbsenceTypes(): Promise<AbsenceType[]> {
  const { data } = await apiClient.get<SingleResponse<AbsenceType[]>>("/absence-types");
  return data.data;
}

export async function getAbsenceRequests(
  filters: AbsenceRequestFilters = {},
): Promise<PaginatedResponse<AbsenceRequestListItem>> {
  const { data } = await apiClient.get<PaginatedResponse<AbsenceRequestListItem>>(
    "/absence-requests",
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getAbsenceRequestById(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.get<SingleResponse<AbsenceRequestDetail>>(`/absence-requests/${id}`);
  return data.data;
}

export async function createAbsenceRequest(
  input: CreateAbsenceRequestInput,
): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.post<SingleResponse<AbsenceRequestDetail>>(
    "/absence-requests",
    input,
  );
  return data.data;
}

export async function approveAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `/absence-requests/${id}/approve`,
  );
  return data.data;
}

export async function rejectAbsenceRequest(
  id: string,
  reason: string,
): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `/absence-requests/${id}/reject`,
    { reason },
  );
  return data.data;
}

export async function needsInfoAbsenceRequest(
  id: string,
  comment: string,
): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `/absence-requests/${id}/needs-info`,
    { comment },
  );
  return data.data;
}

export async function cancelAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `/absence-requests/${id}/cancel`,
  );
  return data.data;
}
