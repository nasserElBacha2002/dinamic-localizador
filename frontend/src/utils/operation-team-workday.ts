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

/**
 * Picks today's workday only when exactly one row matches that date.
 * MULTI_SHIFT can materialize several same-date workdays (one per shift);
 * never silently pick the first without an explicit workdayId choice.
 */
export function pickDefaultTeamWorkday(
  workdays: OperationWorkdaySummary[],
  operationalToday: string,
): OperationTeamWorkdaySelection | null {
  const todayWorkdays = workdays.filter((workday) => workday.workDate === operationalToday);
  if (todayWorkdays.length !== 1) {
    return null;
  }

  const todayWorkday = todayWorkdays[0]!;
  return {
    workdayId: todayWorkday.id,
    workDate: todayWorkday.workDate,
  };
}

export function formatTeamWorkdayLabel(
  workDate: string,
  operationalToday: string,
  shiftName?: string | null,
): string {
  const formatted = formatDateOnlyWithWeekday(workDate);
  const base = workDate === operationalToday ? `Hoy, ${formatted}` : formatted;
  const trimmedShift = shiftName?.trim();
  if (trimmedShift) {
    return `${base} · ${trimmedShift}`;
  }
  return base;
}

export function buildTeamWorkdaySelectOptions(
  workdays: OperationWorkdaySummary[],
  operationalToday: string,
): Array<{ value: string; label: string }> {
  return [...workdays]
    .sort((left, right) => {
      const byDate = right.workDate.localeCompare(left.workDate);
      if (byDate !== 0) {
        return byDate;
      }
      const leftShift = left.shiftNameSnapshot ?? left.shiftCodeSnapshot ?? "";
      const rightShift = right.shiftNameSnapshot ?? right.shiftCodeSnapshot ?? "";
      return leftShift.localeCompare(rightShift, "es");
    })
    .map((workday) => {
      const shiftLabel = workday.shiftNameSnapshot ?? workday.shiftCodeSnapshot ?? null;
      return {
        value: workday.id,
        label: `${formatTeamWorkdayLabel(workday.workDate, operationalToday, shiftLabel)} · ${workday.scheduledEmployeesCount} colaborador(es)`,
      };
    });
}
