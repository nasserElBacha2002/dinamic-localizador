export const OPERATION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

/** Status restored when reactivating a cancelled operation. */
export const OPERATION_REACTIVATION_STATUS: OperationStatus = "SCHEDULED";

const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  // Reactivation restores a safe operational status; lifecycle may later promote ONE_TIME.
  CANCELLED: [OPERATION_REACTIVATION_STATUS],
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

export const isOperationReactivatable = (status: OperationStatus): boolean =>
  status === "CANCELLED";
