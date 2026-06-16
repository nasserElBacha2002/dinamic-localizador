import type { InventoryStatus } from "../types/inventory";

const ALLOWED_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
  CANCELLED: ["CANCELLED"],
};

export function getAllowedStatusOptions(current: InventoryStatus): InventoryStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

export function isInventoryAssignable(status: InventoryStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}

export function isInventoryEditable(status: InventoryStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}
