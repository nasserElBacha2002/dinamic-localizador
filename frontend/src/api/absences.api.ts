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
import { apiClient, buildParams } from "./client";
import { companyApiPath } from "./company-path";

export async function getAbsenceTypes(companyId?: string): Promise<AbsenceType[]> {
  const { data } = await apiClient.get<SingleResponse<AbsenceType[]>>(
    companyApiPath("absence-types", companyId),
  );
  return data.data;
}

export async function getAbsenceRequests(
  filters: AbsenceRequestFilters = {},
  companyId?: string,
): Promise<PaginatedResponse<AbsenceRequestListItem>> {
  const { data } = await apiClient.get<PaginatedResponse<AbsenceRequestListItem>>(
    companyApiPath("absence-requests", companyId),
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getAbsenceRequestById(id: string, companyId?: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.get<SingleResponse<AbsenceRequestDetail>>(
    companyApiPath(`absence-requests/${id}`, companyId),
  );
  return data.data;
}

export async function createAbsenceRequest(input: CreateAbsenceRequestInput): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.post<SingleResponse<AbsenceRequestDetail>>(
    companyApiPath("absence-requests"),
    input,
  );
  return data.data;
}

export async function approveAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    companyApiPath(`absence-requests/${id}/approve`),
  );
  return data.data;
}

export async function rejectAbsenceRequest(id: string, reason: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    companyApiPath(`absence-requests/${id}/reject`),
    { reason },
  );
  return data.data;
}

export async function needsInfoAbsenceRequest(id: string, comment: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    companyApiPath(`absence-requests/${id}/needs-info`),
    { comment },
  );
  return data.data;
}

export async function cancelAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await apiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    companyApiPath(`absence-requests/${id}/cancel`),
  );
  return data.data;
}

export async function getEmployeeAbsenceBalances(
  employeeId: string,
  year: number,
  companyId?: string,
): Promise<EmployeeAbsenceBalanceSummary[]> {
  const { data } = await apiClient.get<SingleResponse<EmployeeAbsenceBalanceSummary[]>>(
    companyApiPath(`employees/${employeeId}/absence-balances`, companyId),
    { params: { year } },
  );
  return data.data;
}

export async function upsertEmployeeAbsenceBalance(
  employeeId: string,
  absenceTypeId: string,
  input: UpsertEmployeeAbsenceBalanceInput,
): Promise<EmployeeAbsenceBalanceSummary> {
  const { data } = await apiClient.put<SingleResponse<EmployeeAbsenceBalanceSummary>>(
    companyApiPath(`employees/${employeeId}/absence-balances/${absenceTypeId}`),
    input,
  );
  return data.data;
}
