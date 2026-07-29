import { AppError } from "../errors/app-error";
import type { AbsenceRequestEventType, AbsenceRequestStatus } from "../types/absence";

/** Statuses that block overlapping date ranges for the same employee. */
export const ABSENCE_ACTIVE_OVERLAP_STATUSES = [
  "PENDING",
  "NEEDS_INFO",
  "APPROVED",
] as const satisfies readonly AbsenceRequestStatus[];

/**
 * Statuses where an admin may still edit request fields (admin correction path).
 * Not an employee self-service path.
 */
export const ABSENCE_ADMIN_EDITABLE_STATUSES = [
  "NEEDS_INFO",
] as const satisfies readonly AbsenceRequestStatus[];

export type AbsenceTransitionAction =
  | "APPROVE"
  | "REJECT"
  | "NEEDS_INFO"
  | "UPDATE_NEEDS_INFO_COMMENT"
  | "CANCEL"
  | "RESUBMIT"
  | "AUTO_APPROVE";

export type AbsenceTransitionRule = {
  from: readonly AbsenceRequestStatus[];
  to: AbsenceRequestStatus;
  eventType: AbsenceRequestEventType;
  requiresComment: boolean;
  /** Balance is validated/consumed only on approve paths (computed, not reserved). */
  affectsBalance: boolean;
  triggersReconciliation: boolean;
};

const TRANSITIONS: Record<AbsenceTransitionAction, AbsenceTransitionRule> = {
  APPROVE: {
    from: ["PENDING", "NEEDS_INFO"],
    to: "APPROVED",
    eventType: "APPROVED",
    requiresComment: false,
    affectsBalance: true,
    triggersReconciliation: true,
  },
  REJECT: {
    from: ["PENDING", "NEEDS_INFO"],
    to: "REJECTED",
    eventType: "REJECTED",
    requiresComment: true,
    affectsBalance: false,
    triggersReconciliation: true,
  },
  /** First request for more information — only from PENDING. */
  NEEDS_INFO: {
    from: ["PENDING"],
    to: "NEEDS_INFO",
    eventType: "NEEDS_INFO",
    requiresComment: true,
    affectsBalance: false,
    triggersReconciliation: false,
  },
  /** Update the needs-info comment without changing status. */
  UPDATE_NEEDS_INFO_COMMENT: {
    from: ["NEEDS_INFO"],
    to: "NEEDS_INFO",
    eventType: "NEEDS_INFO",
    requiresComment: true,
    affectsBalance: false,
    triggersReconciliation: false,
  },
  CANCEL: {
    from: ["PENDING", "NEEDS_INFO"],
    to: "CANCELLED",
    eventType: "CANCELLED",
    requiresComment: false,
    affectsBalance: false,
    triggersReconciliation: true,
  },
  /** Admin resubmit after NEEDS_INFO corrections → PENDING. Auto-approve is a separate step. */
  RESUBMIT: {
    from: ["NEEDS_INFO"],
    to: "PENDING",
    eventType: "RESUBMITTED",
    requiresComment: false,
    affectsBalance: false,
    triggersReconciliation: false,
  },
  AUTO_APPROVE: {
    from: ["PENDING"],
    to: "APPROVED",
    eventType: "APPROVED",
    requiresComment: false,
    affectsBalance: true,
    triggersReconciliation: true,
  },
};

export const getAbsenceTransition = (action: AbsenceTransitionAction): AbsenceTransitionRule =>
  TRANSITIONS[action];

export const assertAbsenceTransition = (
  action: AbsenceTransitionAction,
  currentStatus: AbsenceRequestStatus,
): AbsenceTransitionRule & { fromStatusesForUpdate: AbsenceRequestStatus[] } => {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(currentStatus)) {
    throw new AppError(
      409,
      "ABSENCE_INVALID_TRANSITION",
      `No se puede ejecutar ${action} desde el estado ${currentStatus}.`,
    );
  }
  return {
    ...rule,
    fromStatusesForUpdate: [...rule.from],
  };
};

export const isAbsenceAdminEditableStatus = (status: AbsenceRequestStatus): boolean =>
  (ABSENCE_ADMIN_EDITABLE_STATUSES as readonly AbsenceRequestStatus[]).includes(status);

/** Statuses that still accept admin review actions (approve/reject/cancel). */
export const isAbsenceReviewableStatus = (status: AbsenceRequestStatus): boolean =>
  status === "PENDING" || status === "NEEDS_INFO";

/**
 * Builds a SQL `IN (...)` fragment from known enum statuses only.
 * Never pass user input — values must come from transition policy constants.
 */
export const toAbsenceStatusSqlInList = (
  statuses: readonly AbsenceRequestStatus[],
): string => {
  if (statuses.length === 0) {
    throw new Error("toAbsenceStatusSqlInList requires at least one status");
  }
  const allowed = new Set<AbsenceRequestStatus>([
    "PENDING",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "NEEDS_INFO",
  ]);
  for (const status of statuses) {
    if (!allowed.has(status)) {
      throw new Error(`Invalid absence status for SQL fragment: ${status}`);
    }
  }
  return statuses.map((status) => `'${status}'`).join(", ");
};

export const ABSENCE_OVERLAP_STATUS_SQL = toAbsenceStatusSqlInList(ABSENCE_ACTIVE_OVERLAP_STATUSES);
