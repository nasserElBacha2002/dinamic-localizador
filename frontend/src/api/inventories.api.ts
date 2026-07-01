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
import { apiClient, buildParams } from "./client";
import { companyApiPath } from "./company-path";

export async function getInventories(
  filters: InventoryFilters = {},
  companyId?: string,
): Promise<PaginatedResponse<InventoryWithStore>> {
  const { data } = await apiClient.get<PaginatedResponse<InventoryWithStore>>(
    companyApiPath("inventories", companyId),
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getInventoryById(id: string, companyId?: string): Promise<InventoryDetail> {
  const { data } = await apiClient.get<SingleResponse<InventoryDetail>>(
    companyApiPath(`inventories/${id}`, companyId),
  );
  return data.data;
}

export async function createInventory(input: CreateInventoryInput): Promise<Inventory> {
  const { data } = await apiClient.post<SingleResponse<Inventory>>(companyApiPath("inventories"), input);
  return data.data;
}

export async function updateInventory(id: string, input: UpdateInventoryInput): Promise<Inventory> {
  const { data } = await apiClient.put<SingleResponse<Inventory>>(
    companyApiPath(`inventories/${id}`),
    input,
  );
  return data.data;
}

export async function cancelInventory(id: string): Promise<Inventory> {
  const { data } = await apiClient.delete<SingleResponse<Inventory>>(
    companyApiPath(`inventories/${id}`),
  );
  return data.data;
}

export async function getInventoryEmployees(
  inventoryId: string,
  companyId?: string,
): Promise<InventoryEmployeeAssignment[]> {
  const { data } = await apiClient.get<SingleResponse<InventoryEmployeeAssignment[]>>(
    companyApiPath(`inventories/${inventoryId}/employees`, companyId),
  );
  return data.data;
}

export async function assignEmployeeToInventory(
  inventoryId: string,
  employeeId: string,
): Promise<InventoryEmployeeAssignment> {
  const { data } = await apiClient.post<SingleResponse<InventoryEmployeeAssignment>>(
    companyApiPath(`inventories/${inventoryId}/employees`),
    { employeeId },
  );
  return data.data;
}

export async function unassignEmployeeFromInventory(
  inventoryId: string,
  employeeId: string,
): Promise<void> {
  await apiClient.delete(companyApiPath(`inventories/${inventoryId}/employees/${employeeId}`));
}

export async function getInventoryAttendanceSummary(
  inventoryId: string,
  filters: InventoryAttendanceSummaryFilters = {},
  companyId?: string,
) {
  const { data } = await apiClient.get<SingleResponse<InventoryAttendanceSummaryResponse>>(
    companyApiPath(`inventories/${inventoryId}/attendance-summary`, companyId),
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
  const { data } = await apiClient.post<{ data: InventoryImportPreviewResult }>(
    companyApiPath("inventories/import/preview"),
    payload,
    { timeout: IMPORT_PREVIEW_TIMEOUT_MS },
  );
  return data.data;
}

export async function confirmInventoryImport(rows: InventoryImportConfirmRow[]) {
  const { data } = await apiClient.post<{ data: Inventory[]; count: number }>(
    companyApiPath("inventories/import/confirm"),
    { rows },
    { timeout: IMPORT_CONFIRM_TIMEOUT_MS },
  );
  return data;
}
