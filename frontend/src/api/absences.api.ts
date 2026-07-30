import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AbsenceAttachmentPolicy,
  AbsenceAttachmentStorageHealth,
  AbsenceBalanceMovement,
  AbsenceBalanceMovementsFilters,
  AbsenceRequestAttachmentDto,
  AbsenceRequestDetail,
  AbsenceRequestFilters,
  AbsenceRequestListItem,
  AbsenceType,
  AdjustEmployeeAbsenceBalanceInput,
  CreateAbsenceRequestInput,
  EmployeeAbsenceBalanceSummary,
  UpdateNeedsInfoAbsenceRequestInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../types/absence";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getAbsenceTypes(): Promise<AbsenceType[]> {
  const { data } = await scopedApiClient.get<SingleResponse<AbsenceType[]>>("absence-types");
  return data.data;
}

export async function updateAbsenceType(
  id: string,
  input: {
    dayCountingMode?: "CALENDAR_DAYS" | "BUSINESS_DAYS";
    calendarId?: string | null;
    attachmentPolicy?: AbsenceAttachmentPolicy;
  },
): Promise<AbsenceType> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceType>>(
    `absence-types/${id}`,
    input,
  );
  return data.data;
}

export async function getAbsenceRequests(
  filters: AbsenceRequestFilters = {},
): Promise<PaginatedResponse<AbsenceRequestListItem>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AbsenceRequestListItem>>(
    "absence-requests",
    {
      params: buildParams(filters as Record<string, string | number | boolean | string[] | undefined>),
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

export async function updateNeedsInfoAbsenceRequest(
  id: string,
  input: UpdateNeedsInfoAbsenceRequestInput,
): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}`,
    input,
  );
  return data.data;
}

export async function resubmitAbsenceRequest(id: string): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AbsenceRequestDetail>>(
    `absence-requests/${id}/resubmit`,
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

export async function adjustEmployeeAbsenceBalance(
  employeeId: string,
  absenceTypeId: string,
  input: AdjustEmployeeAbsenceBalanceInput,
): Promise<AbsenceBalanceMovement> {
  const { data } = await scopedApiClient.post<SingleResponse<AbsenceBalanceMovement>>(
    `employees/${employeeId}/absence-balances/${absenceTypeId}/adjustments`,
    input,
  );
  return data.data;
}

export async function getEmployeeAbsenceBalanceMovements(
  employeeId: string,
  absenceTypeId: string,
  filters: AbsenceBalanceMovementsFilters = {},
): Promise<PaginatedResponse<AbsenceBalanceMovement>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AbsenceBalanceMovement>>(
    `employees/${employeeId}/absence-balances/${absenceTypeId}/movements`,
    { params: filters },
  );
  return data;
}

export async function listAbsenceAttachments(
  requestId: string,
): Promise<AbsenceRequestAttachmentDto[]> {
  const { data } = await scopedApiClient.get<SingleResponse<AbsenceRequestAttachmentDto[]>>(
    `absence-requests/${requestId}/attachments`,
  );
  return data.data;
}

export async function uploadAbsenceAttachment(
  requestId: string,
  file: File,
  onUploadProgress?: (percent: number) => void,
  idempotencyKey?: string,
): Promise<AbsenceRequestAttachmentDto> {
  const formData = new FormData();
  formData.append("file", file);
  const key = idempotencyKey ?? crypto.randomUUID();
  const { data } = await scopedApiClient.post<SingleResponse<AbsenceRequestAttachmentDto>>(
    `absence-requests/${requestId}/attachments`,
    formData,
    {
      timeout: 60_000,
      headers: { "Idempotency-Key": key },
      onUploadProgress: (event) => {
        if (!onUploadProgress || !event.total) {
          return;
        }
        onUploadProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
      },
    },
  );
  return data.data;
}

export async function createAbsenceRequestDraft(input: CreateAbsenceRequestInput): Promise<{
  id: string;
  attachmentPolicySnapshot: AbsenceAttachmentPolicy;
  status: string;
}> {
  const { data } = await scopedApiClient.post<
    SingleResponse<{
      id: string;
      attachmentPolicySnapshot: AbsenceAttachmentPolicy;
      status: string;
    }>
  >("absence-request-drafts", input);
  return data.data;
}

export async function uploadAbsenceDraftAttachment(
  draftId: string,
  file: File,
  idempotencyKey: string,
  onUploadProgress?: (percent: number) => void,
): Promise<AbsenceRequestAttachmentDto> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await scopedApiClient.post<SingleResponse<AbsenceRequestAttachmentDto>>(
    `absence-request-drafts/${draftId}/attachments`,
    formData,
    {
      timeout: 60_000,
      headers: { "Idempotency-Key": idempotencyKey },
      onUploadProgress: (event) => {
        if (!onUploadProgress || !event.total) {
          return;
        }
        onUploadProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
      },
    },
  );
  return data.data;
}

export async function submitAbsenceRequestDraft(
  draftId: string,
  idempotencyKey: string,
): Promise<AbsenceRequestDetail> {
  const { data } = await scopedApiClient.post<SingleResponse<AbsenceRequestDetail>>(
    `absence-request-drafts/${draftId}/submit`,
    { idempotencyKey },
  );
  return data.data;
}

export async function deleteAbsenceAttachment(
  requestId: string,
  attachmentId: string,
): Promise<AbsenceRequestAttachmentDto> {
  const { data } = await scopedApiClient.delete<SingleResponse<AbsenceRequestAttachmentDto>>(
    `absence-requests/${requestId}/attachments/${attachmentId}`,
  );
  return data.data;
}

/** Relative scoped API path for authenticated binary download. */
export function getAbsenceAttachmentContentUrl(
  requestId: string,
  attachmentId: string,
): string {
  return `absence-requests/${requestId}/attachments/${attachmentId}/content`;
}

export async function downloadAbsenceAttachmentContent(
  requestId: string,
  attachmentId: string,
): Promise<Blob> {
  const { data } = await scopedApiClient.get<Blob>(
    getAbsenceAttachmentContentUrl(requestId, attachmentId),
    { responseType: "blob", timeout: 60_000 },
  );
  return data;
}

export async function getAbsenceAttachmentStorageHealth(): Promise<AbsenceAttachmentStorageHealth> {
  const { data } = await scopedApiClient.get<SingleResponse<AbsenceAttachmentStorageHealth>>(
    "absence-requests/storage-health",
  );
  return data.data;
}
