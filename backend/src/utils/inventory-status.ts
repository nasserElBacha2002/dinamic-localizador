export const INVENTORY_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionInventoryStatus = (
  current: InventoryStatus,
  next: InventoryStatus,
): boolean => {
  if (current === next) {
    return true;
  }

  return ALLOWED_TRANSITIONS[current].includes(next);
};

export const isInventoryEditable = (status: InventoryStatus): boolean =>
  status === "SCHEDULED" || status === "IN_PROGRESS";

export const isInventoryAssignable = (status: InventoryStatus): boolean =>
  status === "SCHEDULED" || status === "IN_PROGRESS";
