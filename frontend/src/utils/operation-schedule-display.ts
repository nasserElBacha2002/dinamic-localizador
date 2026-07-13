import type { OperationKind } from "../types/operation";
import type { OperationScheduleSummary, OperationScheduleView } from "../types/schedule";

export const operationKindLabels: Record<OperationKind, string> = {
  ONE_TIME: "Fecha específica",
  RECURRING: "Trabajo habitual",
};

export const scheduleSourceLabels = {
  COMPANY: "Horario de la empresa",
  CUSTOM: "Horario específico",
} as const;

export function formatOperationScheduleListLabel(
  operationKind: OperationKind,
  scheduledStart: string | null,
  scheduledEnd: string | null,
  scheduleSummary?: OperationScheduleSummary,
): string {
  if (operationKind === "RECURRING") {
    if (!scheduleSummary) {
      return "Trabajo habitual";
    }

    const sourceLabel =
      scheduleSummary.scheduleSource === "COMPANY"
        ? "Horario de la empresa"
        : "Horario específico";

    return `Trabajo habitual · ${sourceLabel} · ${scheduleSummary.summaryLabel}`;
  }

  if (!scheduledStart) {
    return "—";
  }

  const start = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(scheduledStart));

  if (!scheduledEnd) {
    return start;
  }

  const endTime = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(scheduledEnd));

  return `${start} → ${endTime}`;
}

export function formatRecurringValidity(
  validFrom: string,
  validUntil: string | null,
): string {
  const from = validFrom.split("-").reverse().join("/");
  if (!validUntil) {
    return `Desde ${from} · Sin fecha de finalización`;
  }
  return `Desde ${from} · Hasta ${validUntil.split("-").reverse().join("/")}`;
}

export function buildCompanySchedulePreviewLabel(days: OperationScheduleView["days"]): string {
  const enabled = days.filter((day) => day.isEnabled);
  if (enabled.length === 0) {
    return "Sin días laborables";
  }

  const sameHours = enabled.every(
    (day) => day.startTime === enabled[0].startTime && day.endTime === enabled[0].endTime,
  );

  if (sameHours && enabled.length >= 2) {
    return `${enabled[0].startTime}–${enabled[0].endTime}`;
  }

  return "Horario semanal personalizado";
}
