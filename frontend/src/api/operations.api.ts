import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateOperationInput,
  Operation,
  OperationDetail,
  OperationEmployeeAssignment,
  OperationFilters,
  OperationWithService,
  UpdateOperationInput,
} from "../types/operation";
import type {
  OperationAttendanceSummaryFilters,
  OperationAttendanceSummaryResponse,
} from "../types/operation-attendance-summary";
import type {
  OperationImportConfirmRow,
  OperationImportPreviewPayload,
  OperationImportPreviewResult,
} from "../types/operation-import";
import { buildParams } from "./client";
import {
  API_ENDPOINTS,
  operationAssignmentMemberPath,
  operationAssignmentPath,
  operationPath,
} from "./endpoints";
import { scopedApiClient } from "./scoped-client";

export async function getOperations(
  filters: OperationFilters = {},
): Promise<PaginatedResponse<OperationWithService>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<OperationWithService>>(
    API_ENDPOINTS.operations,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getOperationById(id: string): Promise<OperationDetail> {
  const { data } = await scopedApiClient.get<SingleResponse<OperationDetail>>(operationPath(id));
  return data.data;
}

export async function createOperation(input: CreateOperationInput): Promise<Operation> {
  const { data } = await scopedApiClient.post<SingleResponse<Operation>>(
    API_ENDPOINTS.operations,
    input,
  );
  return data.data;
}

export async function updateOperation(id: string, input: UpdateOperationInput): Promise<Operation> {
  const { data } = await scopedApiClient.put<SingleResponse<Operation>>(operationPath(id), input);
  return data.data;
}

export async function cancelOperation(id: string): Promise<Operation> {
  const { data } = await scopedApiClient.delete<SingleResponse<Operation>>(operationPath(id));
  return data.data;
}

export async function getOperationEmployees(
  operationId: string,
): Promise<OperationEmployeeAssignment[]> {
  const { data } = await scopedApiClient.get<SingleResponse<OperationEmployeeAssignment[]>>(
    operationAssignmentPath(operationId),
  );
  return data.data;
}

export async function assignEmployeeToOperation(
  operationId: string,
  employeeId: string,
): Promise<OperationEmployeeAssignment> {
  const { data } = await scopedApiClient.post<SingleResponse<OperationEmployeeAssignment>>(
    operationAssignmentPath(operationId),
    { employeeId },
  );
  return data.data;
}

export async function unassignEmployeeFromOperation(
  operationId: string,
  employeeId: string,
): Promise<void> {
  await scopedApiClient.delete(operationAssignmentMemberPath(operationId, employeeId));
}

export async function getOperationAttendanceSummary(
  operationId: string,
  filters: OperationAttendanceSummaryFilters = {},
) {
  const { data } = await scopedApiClient.get<SingleResponse<OperationAttendanceSummaryResponse>>(
    `${operationPath(operationId)}/attendance-summary`,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data.data;
}

const IMPORT_PREVIEW_TIMEOUT_MS = 60_000;
const IMPORT_CONFIRM_TIMEOUT_MS = 120_000;

export async function previewOperationImport(
  payload: OperationImportPreviewPayload,
): Promise<OperationImportPreviewResult> {
  const { data } = await scopedApiClient.post<{ data: OperationImportPreviewResult }>(
    `${API_ENDPOINTS.operations}/import/preview`,
    payload,
    { timeout: IMPORT_PREVIEW_TIMEOUT_MS },
  );
  return data.data;
}

export async function confirmOperationImport(rows: OperationImportConfirmRow[]) {
  const { data } = await scopedApiClient.post<{ data: Operation[]; count: number }>(
    `${API_ENDPOINTS.operations}/import/confirm`,
    { rows },
    { timeout: IMPORT_CONFIRM_TIMEOUT_MS },
  );
  return data;
}
