import type { OperationWorkdaySummary } from "../types/operation-workday";
import { formatDateOnlyWithWeekday } from "./date-only";

export interface OperationTeamWorkdaySelection {
  workdayId: string;
  workDate: string;
}

export function getOperationalTodayDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function pickDefaultTeamWorkday(
  workdays: OperationWorkdaySummary[],
  operationalToday: string,
): OperationTeamWorkdaySelection | null {
  const todayWorkday = workdays.find((workday) => workday.workDate === operationalToday);
  if (!todayWorkday) {
    return null;
  }

  return {
    workdayId: todayWorkday.id,
    workDate: todayWorkday.workDate,
  };
}

export function formatTeamWorkdayLabel(workDate: string, operationalToday: string): string {
  const formatted = formatDateOnlyWithWeekday(workDate);
  if (workDate === operationalToday) {
    return `Hoy, ${formatted}`;
  }
  return formatted;
}

export function buildTeamWorkdaySelectOptions(
  workdays: OperationWorkdaySummary[],
  operationalToday: string,
): Array<{ value: string; label: string }> {
  return [...workdays]
    .sort((left, right) => right.workDate.localeCompare(left.workDate))
    .map((workday) => ({
      value: workday.id,
      label: `${formatTeamWorkdayLabel(workday.workDate, operationalToday)} · ${workday.scheduledEmployeesCount} colaborador(es)`,
    }));
}
