import type { OperationStatus } from "../types/operation";

export const OPERATION_REACTIVATION_STATUS: OperationStatus = "SCHEDULED";

const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  SCHEDULED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
  CANCELLED: ["CANCELLED", OPERATION_REACTIVATION_STATUS],
};

export function getAllowedStatusOptions(current: OperationStatus): OperationStatus[] {
  return ALLOWED_TRANSITIONS[current];
}

export function isOperationAssignable(status: OperationStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}

export function isOperationEditable(status: OperationStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}

export function isOperationReactivatable(status: OperationStatus): boolean {
  return status === "CANCELLED";
}
