import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignEmployeeToInventory,
  cancelInventory,
  createInventory,
  getInventories,
  getInventoryAttendanceSummary,
  getInventoryById,
  getInventoryEmployees,
  unassignEmployeeFromInventory,
  updateInventory,
} from "../api/inventories.api";
import type {
  InventoryFilters,
  UpdateInventoryInput,
} from "../types/inventory";
import type { InventoryAttendanceSummaryFilters } from "../types/inventory-attendance-summary";

export function useInventories(filters: InventoryFilters) {
  return useQuery({
    queryKey: ["inventories", filters],
    queryFn: () => getInventories(filters),
    retry: 1,
  });
}

export function useInventory(inventoryId?: string) {
  return useQuery({
    queryKey: ["inventory", inventoryId],
    queryFn: () => getInventoryById(inventoryId!),
    enabled: Boolean(inventoryId),
  });
}

export function useInventoryEmployees(inventoryId?: string) {
  return useQuery({
    queryKey: ["inventory-employees", inventoryId],
    queryFn: () => getInventoryEmployees(inventoryId!),
    enabled: Boolean(inventoryId),
  });
}

export function useCreateInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInventory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
    },
  });
}

export function useUpdateInventory(inventoryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateInventoryInput) => updateInventory(inventoryId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", inventoryId] });
    },
  });
}

export function useCancelInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelInventory,
    onSuccess: (_data, inventoryId) => {
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", inventoryId] });
    },
  });
}

export function useAssignInventoryEmployee(inventoryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (employeeId: string) => assignEmployeeToInventory(inventoryId, employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", inventoryId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-employees", inventoryId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary", inventoryId] });
    },
  });
}

export function useUnassignInventoryEmployee(inventoryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (employeeId: string) => unassignEmployeeFromInventory(inventoryId, employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory", inventoryId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-employees", inventoryId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary", inventoryId] });
    },
  });
}

export function useInventoryAttendanceSummary(
  inventoryId?: string,
  filters: InventoryAttendanceSummaryFilters = {},
) {
  return useQuery({
    queryKey: ["inventory-attendance-summary", inventoryId, filters],
    queryFn: () => getInventoryAttendanceSummary(inventoryId!, filters),
    enabled: Boolean(inventoryId),
    refetchInterval: 30000,
  });
}
