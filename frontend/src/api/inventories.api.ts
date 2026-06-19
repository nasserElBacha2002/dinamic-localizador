import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateInventoryInput,
  Inventory,
  InventoryAttendanceSummaryResponse,
  InventoryDetail,
  InventoryEmployeeAssignment,
  InventoryFilters,
  InventoryWithStore,
  UpdateInventoryInput,
} from "../types/inventory";
import { apiClient, buildParams } from "./client";

export async function getInventories(
  filters: InventoryFilters = {},
): Promise<PaginatedResponse<InventoryWithStore>> {
  const { data } = await apiClient.get<PaginatedResponse<InventoryWithStore>>("/inventories", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getInventoryById(id: string): Promise<InventoryDetail> {
  const { data } = await apiClient.get<SingleResponse<InventoryDetail>>(`/inventories/${id}`);
  return data.data;
}

export async function createInventory(input: CreateInventoryInput): Promise<Inventory> {
  const { data } = await apiClient.post<SingleResponse<Inventory>>("/inventories", input);
  return data.data;
}

export async function updateInventory(id: string, input: UpdateInventoryInput): Promise<Inventory> {
  const { data } = await apiClient.put<SingleResponse<Inventory>>(`/inventories/${id}`, input);
  return data.data;
}

export async function cancelInventory(id: string): Promise<Inventory> {
  const { data } = await apiClient.delete<SingleResponse<Inventory>>(`/inventories/${id}`);
  return data.data;
}

export async function getInventoryEmployees(inventoryId: string): Promise<InventoryEmployeeAssignment[]> {
  const { data } = await apiClient.get<SingleResponse<InventoryEmployeeAssignment[]>>(
    `/inventories/${inventoryId}/employees`,
  );
  return data.data;
}

export async function assignEmployeeToInventory(
  inventoryId: string,
  employeeId: string,
): Promise<InventoryEmployeeAssignment> {
  const { data } = await apiClient.post<SingleResponse<InventoryEmployeeAssignment>>(
    `/inventories/${inventoryId}/employees`,
    { employeeId },
  );
  return data.data;
}

export async function unassignEmployeeFromInventory(
  inventoryId: string,
  employeeId: string,
): Promise<void> {
  await apiClient.delete(`/inventories/${inventoryId}/employees/${employeeId}`);
}

export async function getInventoryAttendanceSummary(
  inventoryId: string,
  filters: import("../types/inventory").InventoryAttendanceSummaryFilters = {},
) {
  const { data } = await apiClient.get<SingleResponse<InventoryAttendanceSummaryResponse>>(
    `/inventories/${inventoryId}/attendance-summary`,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data.data;
}
