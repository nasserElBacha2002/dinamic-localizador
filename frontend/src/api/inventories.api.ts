import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateInventoryInput,
  Inventory,
  InventoryDetail,
  InventoryEmployeeAssignment,
  InventoryFilters,
  InventoryWithStore,
  UpdateInventoryInput,
} from "../types/inventory";
import type {
  InventoryAttendanceSummaryFilters,
  InventoryAttendanceSummaryResponse,
} from "../types/inventory-attendance-summary";
import type {
  InventoryImportConfirmRow,
  InventoryImportPreviewPayload,
  InventoryImportPreviewResult,
} from "../types/inventory-import";
import { buildParams } from "./client";
import {
  API_ENDPOINTS,
  inventoryAssignmentMemberPath,
  inventoryAssignmentPath,
  operationPath,
} from "./endpoints";
import { scopedApiClient } from "./scoped-client";

export async function getInventories(
  filters: InventoryFilters = {},
): Promise<PaginatedResponse<InventoryWithStore>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<InventoryWithStore>>(
    API_ENDPOINTS.operations,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getInventoryById(id: string): Promise<InventoryDetail> {
  const { data } = await scopedApiClient.get<SingleResponse<InventoryDetail>>(operationPath(id));
  return data.data;
}

export async function createInventory(input: CreateInventoryInput): Promise<Inventory> {
  const { data } = await scopedApiClient.post<SingleResponse<Inventory>>(
    API_ENDPOINTS.operations,
    input,
  );
  return data.data;
}

export async function updateInventory(id: string, input: UpdateInventoryInput): Promise<Inventory> {
  const { data } = await scopedApiClient.put<SingleResponse<Inventory>>(operationPath(id), input);
  return data.data;
}

export async function cancelInventory(id: string): Promise<Inventory> {
  const { data } = await scopedApiClient.delete<SingleResponse<Inventory>>(operationPath(id));
  return data.data;
}

export async function getInventoryEmployees(
  inventoryId: string,
): Promise<InventoryEmployeeAssignment[]> {
  const { data } = await scopedApiClient.get<SingleResponse<InventoryEmployeeAssignment[]>>(
    inventoryAssignmentPath(inventoryId),
  );
  return data.data;
}

export async function assignEmployeeToInventory(
  inventoryId: string,
  employeeId: string,
): Promise<InventoryEmployeeAssignment> {
  const { data } = await scopedApiClient.post<SingleResponse<InventoryEmployeeAssignment>>(
    inventoryAssignmentPath(inventoryId),
    { employeeId },
  );
  return data.data;
}

export async function unassignEmployeeFromInventory(
  inventoryId: string,
  employeeId: string,
): Promise<void> {
  await scopedApiClient.delete(inventoryAssignmentMemberPath(inventoryId, employeeId));
}

export async function getInventoryAttendanceSummary(
  inventoryId: string,
  filters: InventoryAttendanceSummaryFilters = {},
) {
  const { data } = await scopedApiClient.get<SingleResponse<InventoryAttendanceSummaryResponse>>(
    `${operationPath(inventoryId)}/attendance-summary`,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data.data;
}

const IMPORT_PREVIEW_TIMEOUT_MS = 60_000;
const IMPORT_CONFIRM_TIMEOUT_MS = 120_000;

export async function previewInventoryImport(
  payload: InventoryImportPreviewPayload,
): Promise<InventoryImportPreviewResult> {
  const { data } = await scopedApiClient.post<{ data: InventoryImportPreviewResult }>(
    `${API_ENDPOINTS.operations}/import/preview`,
    payload,
    { timeout: IMPORT_PREVIEW_TIMEOUT_MS },
  );
  return data.data;
}

export async function confirmInventoryImport(rows: InventoryImportConfirmRow[]) {
  const { data } = await scopedApiClient.post<{ data: Inventory[]; count: number }>(
    `${API_ENDPOINTS.operations}/import/confirm`,
    { rows },
    { timeout: IMPORT_CONFIRM_TIMEOUT_MS },
  );
  return data;
}
