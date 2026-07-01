import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AbsenceRequestDetail,
  AbsenceRequestFilters,
  AbsenceRequestListItem,
  AbsenceType,
  CreateAbsenceRequestInput,
  EmployeeAbsenceBalanceSummary,
  UpsertEmployeeAbsenceBalanceInput,
} from "../types/absence";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getAbsenceTypes(): Promise<AbsenceType[]> {
  const { data } = await scopedApiClient.get<SingleResponse<AbsenceType[]>>("absence-types");
  return data.data;
}

export async function getAbsenceRequests(
  filters: AbsenceRequestFilters = {},
): Promise<PaginatedResponse<AbsenceRequestListItem>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AbsenceRequestListItem>>(
    "absence-requests",
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getAbsenceRequestById(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.get<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}`,
  );
  return data.data;
}

export async function createAbsenceRequest(input: CreateAbsenceRequestInput): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.post<SingleResponse<AbsenceRequestDetail>>(
    "absence-requests",
    input,
  );
  return data.data;
}

export async function approveAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}/approve`,
  );
  return data.data;
}

export async function rejectAbsenceRequest(id: string, reason: string): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}/reject`,
    { reason },
  );
  return data.data;
}

export async function needsInfoAbsenceRequest(id: string, comment: string): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}/needs-info`,
    { comment },
  );
  return data.data;
}

export async function cancelAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}/cancel`,
  );
  return data.data;
}

export async function getEmployeeAbsenceBalances(
  employeeId: string,
  year: number,
): Promise<EmployeeAbsenceBalanceSummary[]> {
  const { data } = await scopedApiClient.get<SingleResponse<EmployeeAbsenceBalanceSummary[]>>(
    `employees/${employeeId}/absence-balances`,
    { params: { year } },
  );
  return data.data;
}

export async function upsertEmployeeAbsenceBalance(
  employeeId: string,
  absenceTypeId: string,
  input: UpsertEmployeeAbsenceBalanceInput,
): Promise<EmployeeAbsenceBalanceSummary> {
  const { data } = await scopedApiClient.put<SingleResponse<EmployeeAbsenceBalanceSummary>>(
    `employees/${employeeId}/absence-balances/${absenceTypeId}`,
    input,
  );
  return data.data;
}
