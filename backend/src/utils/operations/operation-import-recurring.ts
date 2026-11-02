import { SCHEDULE_SOURCES, type ScheduleSource } from "../../constants/schedule-source";
import { WEEKDAYS, type Weekday } from "../../constants/weekday";
import type { WeeklyScheduleDay } from "../../types/schedule";
import { isValidScheduleTime } from "./weekly-schedule";

const RECURRING_WEEKDAY_COLUMN_KEYS: Record<string, Weekday> = {
  lunes: "MONDAY",
  martes: "TUESDAY",
  miercoles: "WEDNESDAY",
  jueves: "THURSDAY",
  viernes: "FRIDAY",
  sabado: "SATURDAY",
  domingo: "SUNDAY",
};

const TRUTHY_DAY_VALUES = new Set(["1", "s", "si", "sí", "true", "x", "yes", "y"]);

export const RECURRING_IMPORT_WEEKDAY_HEADER_KEYS = Object.keys(RECURRING_WEEKDAY_COLUMN_KEYS);

export const parseRecurringImportDayFlag = (raw: string): boolean => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (TRUTHY_DAY_VALUES.has(normalized)) {
    return true;
  }

  if (/^(no|0|false)$/i.test(normalized)) {
    return false;
  }

  return false;
};

export const parseRecurringImportScheduleSource = (
  raw: string,
): { value: ScheduleSource | null; error: string | null } => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { value: "CUSTOM", error: null };
  }

  if (["company", "empresa", "compania", "compañia"].includes(normalized)) {
    return { value: "COMPANY", error: null };
  }

  if (["custom", "operacion", "operación", "especifico", "específico"].includes(normalized)) {
    return { value: "CUSTOM", error: null };
  }

  if ((SCHEDULE_SOURCES as readonly string[]).includes(normalized.toUpperCase())) {
    return { value: normalized.toUpperCase() as ScheduleSource, error: null };
  }

  return {
    value: null,
    error: "origen_horario debe ser EMPRESA/COMPANY u OPERACION/CUSTOM",
  };
};

export const parseRecurringImportOperationKind = (
  raw: string,
): { kind: "RECURRING" | "ONE_TIME" | null; error: string | null } => {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { kind: "RECURRING", error: null };
  }

  if (["recurring", "recurrente", "fija", "fijo", "habitual"].includes(normalized)) {
    return { kind: "RECURRING", error: null };
  }

  if (["one_time", "one-time", "puntual", "unica", "única", "eventual"].includes(normalized)) {
    return { kind: "ONE_TIME", error: null };
  }

  return {
    kind: null,
    error: "tipo_operacion debe ser RECURRING para este formato de importación",
  };
};

export const parseRecurringImportTime = (
  raw: string,
  label: string,
): { value: string | null; error: string | null } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return { value: null, error: `${label} debe tener formato HH:mm` };
  }

  const normalized = `${match[1]!.padStart(2, "0")}:${match[2]}`;
  if (!isValidScheduleTime(normalized)) {
    return { value: null, error: `${label} no es un horario válido` };
  }

  return { value: normalized, error: null };
};

export const buildRecurringImportScheduleDays = (
  headers: string[],
  row: string[],
  startTime: string,
  endTime: string,
): WeeklyScheduleDay[] => {
  const enabledByWeekday = new Map<Weekday, boolean>();

  for (const [columnKey, weekday] of Object.entries(RECURRING_WEEKDAY_COLUMN_KEYS)) {
    const index = headers.indexOf(columnKey);
    if (index === -1) {
      continue;
    }

    enabledByWeekday.set(weekday, parseRecurringImportDayFlag(row[index] ?? ""));
  }

  return WEEKDAYS.map((dayOfWeek) => {
    const isEnabled = enabledByWeekday.get(dayOfWeek) ?? false;
    return {
      dayOfWeek,
      isEnabled,
      startTime: isEnabled ? startTime : null,
      endTime: isEnabled ? endTime : null,
    };
  });
};

export const hasAnyRecurringWeekdayColumn = (headers: string[]): boolean =>
  RECURRING_IMPORT_WEEKDAY_HEADER_KEYS.some((key) => headers.includes(key));

export const hasRecurringImportCustomScheduleColumnValues = (
  headers: string[],
  row: string[],
): boolean => {
  const startIndex = headers.indexOf("horario_inicio");
  const endIndex = headers.indexOf("horario_fin");
  if (startIndex !== -1 && (row[startIndex] ?? "").trim()) {
    return true;
  }
  if (endIndex !== -1 && (row[endIndex] ?? "").trim()) {
    return true;
  }

  for (const columnKey of RECURRING_IMPORT_WEEKDAY_HEADER_KEYS) {
    const index = headers.indexOf(columnKey);
    if (index === -1) {
      continue;
    }
    if ((row[index] ?? "").trim()) {
      return true;
    }
  }

  return false;
};

