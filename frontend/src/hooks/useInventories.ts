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
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useInventories(filters: InventoryFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["inventories", companyId, filters],
    queryFn: () => getInventories(filters, companyId),
    enabled,
    retry: 1,
  });
}

export function useInventory(inventoryId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(inventoryId));

  return useQuery({
    queryKey: ["inventory", companyId, inventoryId],
    queryFn: () => getInventoryById(inventoryId!, companyId),
    enabled,
  });
}

export function useInventoryEmployees(inventoryId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(inventoryId));

  return useQuery({
    queryKey: ["inventory-employees", companyId, inventoryId],
    queryFn: () => getInventoryEmployees(inventoryId!, companyId),
    enabled,
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
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
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
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-employees"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary"] });
    },
  });
}

export function useUnassignInventoryEmployee(inventoryId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (employeeId: string) => unassignEmployeeFromInventory(inventoryId, employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-employees"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary"] });
    },
  });
}

export function useInventoryAttendanceSummary(
  inventoryId?: string,
  filters: InventoryAttendanceSummaryFilters = {},
) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(inventoryId));

  return useQuery({
    queryKey: ["inventory-attendance-summary", companyId, inventoryId, filters],
    queryFn: () => getInventoryAttendanceSummary(inventoryId!, filters, companyId),
    enabled,
    refetchInterval: enabled ? 30000 : false,
  });
}
