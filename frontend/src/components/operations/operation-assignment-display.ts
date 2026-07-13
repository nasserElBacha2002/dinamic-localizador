import type { AssignmentLifecycleState, OperationEmployeeAssignment } from "../../types/operation";

export type AssignmentDisplayState = AssignmentLifecycleState | "CANCELLED";

export const lifecycleLabels: Record<AssignmentLifecycleState, string> = {
  CURRENT: "Actual",
  FUTURE: "Próxima",
  ENDED: "Finalizada",
};

export const displayStateLabels: Record<AssignmentDisplayState, string> = {
  ...lifecycleLabels,
  CANCELLED: "Cancelada",
};

export type AssignmentActionKind = "cancel-current" | "cancel-future" | "end";

export function resolveAssignmentDisplayState(
  assignment: OperationEmployeeAssignment,
): AssignmentDisplayState {
  if (assignment.cancelledAt) {
    return "CANCELLED";
  }

  return assignment.lifecycleState ?? "CURRENT";
}

export function isOneTimeCurrentAssignment(
  assignment: OperationEmployeeAssignment,
  operationWorkDate: string,
): boolean {
  if (assignment.cancelledAt) {
    return false;
  }

  const sameDay =
    assignment.validFrom === operationWorkDate &&
    (assignment.validUntil === null ||
      assignment.validUntil === operationWorkDate ||
      assignment.validUntil === assignment.validFrom);

  return sameDay && assignment.lifecycleState === "CURRENT";
}

export function isOpenEndedAssignment(assignment: OperationEmployeeAssignment): boolean {
  return !assignment.cancelledAt && assignment.validUntil === null;
}

export function resolveAssignmentAction(
  assignment: OperationEmployeeAssignment,
  operationWorkDate: string,
): AssignmentActionKind | null {
  if (assignment.cancelledAt || assignment.lifecycleState === "ENDED") {
    return null;
  }

  if (assignment.lifecycleState === "FUTURE") {
    return "cancel-future";
  }

  if (assignment.lifecycleState === "CURRENT") {
    if (isOpenEndedAssignment(assignment) && !isOneTimeCurrentAssignment(assignment, operationWorkDate)) {
      return "end";
    }

    return "cancel-current";
  }

  return null;
}

export function assignmentActionLabel(action: AssignmentActionKind): string {
  switch (action) {
    case "cancel-current":
      return "Quitar asignación";
    case "cancel-future":
      return "Cancelar asignación";
    case "end":
      return "Finalizar asignación";
  }
}

export function isCurrentOperationalAssignment(assignment: OperationEmployeeAssignment): boolean {
  return !assignment.cancelledAt && assignment.lifecycleState === "CURRENT";
}

export type AssignmentBatchStatus = "success" | "partial" | "error";

/**
 * Classifies a multi-collaborator assignment attempt so the dialog can decide
 * whether to close (only on full success) and what feedback to show.
 */
export function resolveAssignmentBatchStatus(
  addedCount: number,
  skippedCount: number,
): AssignmentBatchStatus {
  if (skippedCount === 0) {
    return "success";
  }
  return addedCount > 0 ? "partial" : "error";
}

const assignmentErrorMessages: Record<string, string> = {
  ASSIGNMENT_PERIOD_OVERLAP: "Ya existe otra asignación en el período indicado.",
  ASSIGNMENT_ATTENDANCE_CONFLICT:
    "No se puede modificar la asignación porque hay registros de asistencia vinculados.",
  ASSIGNMENT_HAS_ATTENDANCE_RECORDS:
    "No se puede cancelar la asignación porque ya tiene registros de asistencia.",
  ASSIGNMENT_INVALID_END_DATE: "La fecha efectiva no es válida para esta asignación.",
  ASSIGNMENT_ALREADY_BOUNDED:
    "Esta asignación ya tiene fecha de fin; no se puede finalizar nuevamente.",
  ASSIGNMENT_ALREADY_CANCELLED: "La asignación ya está cancelada.",
  OPERATION_ASSIGNMENT_NOT_FOUND: "La asignación no existe.",
};

export function mapAssignmentErrorMessage(code: string | undefined, fallback: string): string {
  if (!code) {
    return fallback;
  }

  return assignmentErrorMessages[code] ?? fallback;
}

export function displayStateTone(state: AssignmentDisplayState) {
  switch (state) {
    case "CURRENT":
      return "success" as const;
    case "FUTURE":
      return "info" as const;
    case "ENDED":
      return "neutral" as const;
    case "CANCELLED":
      return "danger" as const;
  }
}
