import type { Inventory } from "../types/domain";
import type { InventoryStatus } from "./inventory-status";

export const getInventoryEffectiveEnd = (
  scheduledStart: string,
  scheduledEnd: string | null,
  lateToleranceMinutes: number,
): Date => {
  if (scheduledEnd) {
    return new Date(scheduledEnd);
  }

  const start = new Date(scheduledStart);
  return new Date(start.getTime() + lateToleranceMinutes * 60 * 1000);
};

export const resolveLifecycleInventoryStatus = (
  inventory: Pick<
    Inventory,
    "status" | "scheduledStart" | "scheduledEnd" | "earlyToleranceMinutes" | "lateToleranceMinutes"
  >,
  at: Date = new Date(),
): InventoryStatus => {
  if (inventory.status === "CANCELLED" || inventory.status === "COMPLETED") {
    return inventory.status;
  }

  const start = new Date(inventory.scheduledStart);
  const end = getInventoryEffectiveEnd(
    inventory.scheduledStart,
    inventory.scheduledEnd,
    inventory.lateToleranceMinutes,
  );

  if (at >= end) {
    return "COMPLETED";
  }

  if (at >= start) {
    return "IN_PROGRESS";
  }

  return "SCHEDULED";
};

export const isInventoryStartInPast = (scheduledStart: string, at: Date = new Date()): boolean =>
  new Date(scheduledStart) < at;
