import { AppError } from "../errors/app-error";
import type { AbsenceRequestEventType, AbsenceRequestStatus } from "../types/absence";

/** Statuses that block overlapping date ranges for the same employee. */
export const ABSENCE_ACTIVE_OVERLAP_STATUSES = [
  "PENDING",
  "NEEDS_INFO",
  "APPROVED",
] as const satisfies readonly AbsenceRequestStatus[];

/** Statuses that can receive admin review actions (approve/reject/needs-info/cancel). */
export const ABSENCE_REVIEWABLE_STATUSES = [
  "PENDING",
  "NEEDS_INFO",
] as const satisfies readonly AbsenceRequestStatus[];

/** Statuses that allow field edits by admin (employee resubmit path). */
export const ABSENCE_EDITABLE_STATUSES = ["NEEDS_INFO"] as const satisfies readonly AbsenceRequestStatus[];

type AbsenceTransitionAction =
  | "APPROVE"
  | "REJECT"
  | "NEEDS_INFO"
  | "CANCEL"
  | "RESUBMIT"
  | "AUTO_APPROVE";

const TRANSITIONS: Record<
  AbsenceTransitionAction,
  {
    from: readonly AbsenceRequestStatus[];
    to: AbsenceRequestStatus;
    eventType: AbsenceRequestEventType;
  }
> = {
  APPROVE: {
    from: ABSENCE_REVIEWABLE_STATUSES,
    to: "APPROVED",
    eventType: "APPROVED",
  },
  REJECT: {
    from: ABSENCE_REVIEWABLE_STATUSES,
    to: "REJECTED",
    eventType: "REJECTED",
  },
  NEEDS_INFO: {
    from: ABSENCE_REVIEWABLE_STATUSES,
    to: "NEEDS_INFO",
    eventType: "NEEDS_INFO",
  },
  CANCEL: {
    from: ABSENCE_REVIEWABLE_STATUSES,
    to: "CANCELLED",
    eventType: "CANCELLED",
  },
  RESUBMIT: {
    from: ABSENCE_EDITABLE_STATUSES,
    to: "PENDING",
    eventType: "RESUBMITTED",
  },
  AUTO_APPROVE: {
    from: ["PENDING"],
    to: "APPROVED",
    eventType: "APPROVED",
  },
};

export const assertAbsenceTransition = (
  action: AbsenceTransitionAction,
  currentStatus: AbsenceRequestStatus,
): { to: AbsenceRequestStatus; eventType: AbsenceRequestEventType } => {
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(currentStatus)) {
    throw new AppError(
      409,
      "ABSENCE_INVALID_TRANSITION",
      `No se puede ejecutar ${action} desde el estado ${currentStatus}.`,
    );
  }
  return { to: rule.to, eventType: rule.eventType };
};

export const isAbsenceReviewableStatus = (status: AbsenceRequestStatus): boolean =>
  (ABSENCE_REVIEWABLE_STATUSES as readonly AbsenceRequestStatus[]).includes(status);

export const isAbsenceEditableStatus = (status: AbsenceRequestStatus): boolean =>
  (ABSENCE_EDITABLE_STATUSES as readonly AbsenceRequestStatus[]).includes(status);

export const ABSENCE_OVERLAP_STATUS_SQL = ABSENCE_ACTIVE_OVERLAP_STATUSES.map(
  (status) => `'${status}'`,
).join(", ");
