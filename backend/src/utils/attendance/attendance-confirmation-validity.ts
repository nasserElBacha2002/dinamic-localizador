/**
 * Business window for ATTENDANCE_CONFIRMATION_REMINDER replies.
 * Validity is tied to assignment/operation scheduledStart — not BOT_SESSION_TTL.
 *
 * Rule: confirmation is accepted while now < scheduledStart (exclusive end).
 *
 * Final confirmation states (CONFIRMED / UNAVAILABLE) do not flip via WhatsApp reply.
 * Transitions are PENDING → CONFIRMED | UNAVAILABLE only (CAS).
 */

export const CONFIRMATION_EXPIRED_USER_MESSAGE =
  "La ventana para confirmar esta asignación ya finalizó.";

/** True while the employee may still confirm/unavailable for this assignment. */
export const isAttendanceConfirmationWindowOpen = (
  scheduledStart: string | Date,
  now: Date,
): boolean => new Date(scheduledStart).getTime() > now.getTime();

/**
 * Target kinds returned by findConfirmationReplyTarget.
 * Open-window only for durable catch of "1"/"2" without a confirmation session.
 * expired_pending is only used when an expired confirmation session context is present.
 */
export type AttendanceConfirmationReplyTargetKind =
  | "eligible_pending"
  | "expired_pending"
  | "confirmed_open"
  | "unavailable_open";

export interface AttendanceConfirmationReplyTarget {
  kind: AttendanceConfirmationReplyTargetKind;
  notificationId: string;
  operationId: string;
  assignmentId: string;
  employeeId: string;
  scheduledStart: string;
  scheduleVersion: number;
  confirmationStatus: "PENDING" | "CONFIRMED" | "UNAVAILABLE";
  sentAt: string | null;
}

export const mapConfirmationReplyTargetKind = (
  confirmationStatus: AttendanceConfirmationReplyTarget["confirmationStatus"],
  windowOpen: boolean,
): AttendanceConfirmationReplyTargetKind | null => {
  if (!windowOpen) {
    return confirmationStatus === "PENDING" ? "expired_pending" : null;
  }
  if (confirmationStatus === "PENDING") {
    return "eligible_pending";
  }
  if (confirmationStatus === "CONFIRMED") {
    return "confirmed_open";
  }
  if (confirmationStatus === "UNAVAILABLE") {
    return "unavailable_open";
  }
  return null;
};
