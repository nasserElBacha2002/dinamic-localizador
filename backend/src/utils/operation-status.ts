export const OPERATION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransitionOperationStatus = (
  current: OperationStatus,
  next: OperationStatus,
): boolean => {
  if (current === next) {
    return true;
  }

  return ALLOWED_TRANSITIONS[current].includes(next);
};

export const isOperationEditable = (status: OperationStatus): boolean =>
  status === "SCHEDULED" || status === "IN_PROGRESS";

export const isOperationAssignable = (status: OperationStatus): boolean =>
  status === "SCHEDULED" || status === "IN_PROGRESS";
