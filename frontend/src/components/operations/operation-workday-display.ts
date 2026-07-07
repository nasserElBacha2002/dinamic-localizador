import type { MaterializationResult, OperationWorkdaySummary } from "../../types/operation-workday";
import { formatDate, formatTime } from "../../utils/dates";

export const workdayStatusLabels: Record<OperationWorkdaySummary["status"], string> = {
  ACTIVE: "Programada",
  CANCELLED: "Cancelada",
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

  return parts.length > 0
    ? `Jornadas actualizadas correctamente. ${parts.join(" · ")}.`
    : "Jornadas actualizadas correctamente.";
}
