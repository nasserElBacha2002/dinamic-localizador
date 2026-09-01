import type { OperationWorkdaySummary } from "../../types/operation-workday";
import { formatDateOnlyWithWeekday } from "../../utils/date-only";
import { formatTime } from "../../utils/dates";

export function formatWorkdayDate(workDate: string): string {
  return formatDateOnlyWithWeekday(workDate);
}

export function formatExpectedTimeRange(workday: OperationWorkdaySummary): string {
  const start = formatTime(workday.expectedStartAt);
  const end = workday.expectedEndAt ? formatTime(workday.expectedEndAt) : "—";
  return `${start}–${end}`;
}

export function buildAbsenceApprovalSuccessMessage(input: {
  justified?: number;
  attendanceConflicts?: number;
}): string {
  if (input.attendanceConflicts && input.attendanceConflicts > 0) {
    const conflictLabel =
      input.attendanceConflicts === 1
        ? "1 jornada conserva asistencia registrada y requiere revisión"
        : `${input.attendanceConflicts} jornadas conservan asistencia registrada y requieren revisión`;
    if (input.justified && input.justified > 0) {
      return `Ausencia aprobada. ${input.justified} jornadas fueron justificadas. ${conflictLabel}.`;
    }
    return `Ausencia aprobada. ${conflictLabel}.`;
  }

  if (input.justified && input.justified > 0) {
    return `Ausencia aprobada. ${input.justified} jornadas fueron justificadas.`;
  }

  return "Ausencia aprobada.";
}
