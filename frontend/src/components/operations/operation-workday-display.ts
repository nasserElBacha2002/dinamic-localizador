import type {
  DerivedEmployeeWorkdayState,
  MaterializationResult,
  OperationWorkdaySummary,
} from "../../types/operation-workday";
import { formatDate, formatTime } from "../../utils/dates";

export const workdayStatusLabels: Record<OperationWorkdaySummary["status"], string> = {
  ACTIVE: "Programada",
  CANCELLED: "Cancelada",
};

export const employeeWorkdayStateLabels: Record<DerivedEmployeeWorkdayState, string> = {
  EXPECTED: "Esperado",
  JUSTIFIED: "Justificado",
  PRESENT: "Con asistencia",
  ABSENT: "Ausente",
  CANCELLED: "Cancelado",
};

export const employeeWorkdayStateTones: Record<
  DerivedEmployeeWorkdayState,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  EXPECTED: "info",
  JUSTIFIED: "warning",
  PRESENT: "success",
  ABSENT: "danger",
  CANCELLED: "neutral",
};

export function formatWorkdayDate(workDate: string): string {
  const [year, month, day] = workDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${formatDate(workDate)}`;
}

export function formatExpectedTimeRange(workday: OperationWorkdaySummary): string {
  const start = formatTime(workday.expectedStartAt);
  const end = workday.expectedEndAt ? formatTime(workday.expectedEndAt) : "—";
  return `${start}–${end}`;
}

export function buildMaterializationSuccessMessage(result: MaterializationResult): string {
  const parts: string[] = [];
  if (result.operationWorkdaysCreated > 0) {
    parts.push(`${result.operationWorkdaysCreated} jornadas generadas`);
  }
  if (result.employeeWorkdaysCreated > 0) {
    parts.push(`${result.employeeWorkdaysCreated} colaboradores incorporados`);
  }
  if (result.employeeWorkdaysReactivated > 0) {
    parts.push(`${result.employeeWorkdaysReactivated} expectativas reactivadas`);
  }
  if (result.absenceReconciliation?.justified) {
    parts.push(`${result.absenceReconciliation.justified} jornadas justificadas`);
  }

  return parts.length > 0
    ? `Jornadas actualizadas correctamente. ${parts.join(" · ")}.`
    : "Jornadas actualizadas correctamente.";
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
