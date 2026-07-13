import type { DateRangeMode, DateRangePresetKey, DateRangeValue } from "../types/date-range";
import { getTodayDateInput } from "./dates";

export const EMPTY_DATE_RANGE_VALUE: DateRangeValue = {
  preset: null,
  from: null,
  to: null,
};

const PRESET_LABELS: Record<DateRangePresetKey, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  tomorrow: "Mañana",
  this_week: "Esta semana",
  last_week: "Semana pasada",
  next_week: "Próxima semana",
  this_month: "Este mes",
  last_month: "Mes pasado",
  next_month: "Próximo mes",
  last_7_days: "Últimos 7 días",
  next_7_days: "Próximos 7 días",
  last_30_days: "Últimos 30 días",
  next_30_days: "Próximos 30 días",
  custom: "Rango personalizado",
};

const PRESETS_BY_MODE: Record<DateRangeMode, DateRangePresetKey[]> = {
  past: [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_7_days",
    "last_30_days",
    "custom",
  ],
  future: [
    "today",
    "tomorrow",
    "this_week",
    "next_week",
    "this_month",
    "next_month",
    "next_7_days",
    "next_30_days",
    "custom",
  ],
  mixed: [
    "today",
    "yesterday",
    "tomorrow",
    "this_week",
    "last_week",
    "next_week",
    "this_month",
    "custom",
  ],
};

type DateParts = { year: number; month: number; day: number };

export function parseDateInputValue(dateValue: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) {
    throw new Error(`Invalid date format: ${dateValue}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatDateParts(parts: DateParts): string {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function buildDateInputValue(year: number, month: number, day: number): string {
  return formatDateParts({ year, month, day });
}

function addDays(dateValue: string, days: number): string {
  const { year, month, day } = parseDateInputValue(dateValue);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function addMonths(dateValue: string, months: number): string {
  const { year, month, day } = parseDateInputValue(dateValue);
  const shifted = new Date(Date.UTC(year, month - 1 + months, day));
  return formatDateParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function startOfMonth(dateValue: string): string {
  const { year, month } = parseDateInputValue(dateValue);
  return formatDateParts({ year, month, day: 1 });
}

function endOfMonth(dateValue: string): string {
  const { year, month } = parseDateInputValue(dateValue);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return formatDateParts({ year, month, day: lastDay });
}

function daysFromMonday(dateValue: string): number {
  const { year, month, day } = parseDateInputValue(dateValue);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (weekday + 6) % 7;
}

function startOfWeek(dateValue: string): string {
  return addDays(dateValue, -daysFromMonday(dateValue));
}

function endOfWeek(dateValue: string): string {
  return addDays(startOfWeek(dateValue), 6);
}

export function getDateRangePresetLabel(preset: DateRangePresetKey): string {
  return PRESET_LABELS[preset];
}

export function getDefaultPresetsForMode(mode: DateRangeMode): DateRangePresetKey[] {
  return [...PRESETS_BY_MODE[mode]];
}

export function normalizeDateRangePresets(
  presets: DateRangePresetKey[],
  allowCustomRange: boolean,
): DateRangePresetKey[] {
  const seen = new Set<DateRangePresetKey>();
  const normalized: DateRangePresetKey[] = [];

  for (const preset of presets) {
    if (preset === "custom") {
      continue;
    }
    if (!seen.has(preset)) {
      seen.add(preset);
      normalized.push(preset);
    }
  }

  if (allowCustomRange) {
    normalized.push("custom");
  }

  return normalized;
}

export function resolveDateRangePreset(
  preset: DateRangePresetKey,
  referenceDate: string = getTodayDateInput(),
): DateRangeValue {
  const today = referenceDate;

  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { preset, from: yesterday, to: yesterday };
    }
    case "tomorrow": {
      const tomorrow = addDays(today, 1);
      return { preset, from: tomorrow, to: tomorrow };
    }
    case "this_week":
      return { preset, from: startOfWeek(today), to: endOfWeek(today) };
    case "last_week": {
      const lastWeekReference = addDays(startOfWeek(today), -1);
      return {
        preset,
        from: startOfWeek(lastWeekReference),
        to: endOfWeek(lastWeekReference),
      };
    }
    case "next_week": {
      const nextWeekReference = addDays(endOfWeek(today), 1);
      return {
        preset,
        from: startOfWeek(nextWeekReference),
        to: endOfWeek(nextWeekReference),
      };
    }
    case "this_month":
      return { preset, from: startOfMonth(today), to: endOfMonth(today) };
    case "last_month": {
      const lastMonth = addMonths(today, -1);
      return { preset, from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case "next_month": {
      const nextMonth = addMonths(today, 1);
      return { preset, from: startOfMonth(nextMonth), to: endOfMonth(nextMonth) };
    }
    case "last_7_days":
      return { preset, from: addDays(today, -6), to: today };
    case "next_7_days":
      return { preset, from: today, to: addDays(today, 6) };
    case "last_30_days":
      return { preset, from: addDays(today, -29), to: today };
    case "next_30_days":
      return { preset, from: today, to: addDays(today, 29) };
    case "custom":
      return { preset, from: null, to: null };
    default:
      return { preset, from: null, to: null };
  }
}

export function formatDateInputDisplay(dateValue: string | null): string {
  if (!dateValue) {
    return "";
  }

  const { year, month, day } = parseDateInputValue(dateValue);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatDateRangeDisplay(value: DateRangeValue): string {
  if (!value.preset) {
    return "Todas las fechas";
  }

  if (value.preset !== "custom") {
    return getDateRangePresetLabel(value.preset);
  }

  if (value.from && value.to) {
    return `Rango personalizado: ${formatDateInputDisplay(value.from)} - ${formatDateInputDisplay(value.to)}`;
  }

  return getDateRangePresetLabel("custom");
}

export type CustomDateRangeValidation = {
  fromError: string | null;
  toError: string | null;
  rangeError: string | null;
  isValid: boolean;
};

export function validateCustomDateRange(
  from: string | null,
  to: string | null,
): CustomDateRangeValidation {
  const fromError = from ? null : "La fecha desde es obligatoria";
  const toError = to ? null : "La fecha hasta es obligatoria";
  const rangeError =
    from && to && from > to ? "La fecha desde no puede ser posterior a la fecha hasta" : null;

  return {
    fromError,
    toError,
    rangeError,
    isValid: !fromError && !toError && !rangeError,
  };
}

export function isDateRangeComplete(value: DateRangeValue): boolean {
  return Boolean(value.from && value.to);
}

export function isDateRangeValid(value: DateRangeValue): boolean {
  if (!value.preset) {
    return false;
  }

  if (value.preset !== "custom") {
    return isDateRangeComplete(value);
  }

  return validateCustomDateRange(value.from, value.to).isValid;
}

export function getDateRangeQueryValue(value: DateRangeValue): {
  from: string | undefined;
  to: string | undefined;
} {
  if (!isDateRangeValid(value)) {
    return { from: undefined, to: undefined };
  }

  return {
    from: value.from ?? undefined,
    to: value.to ?? undefined,
  };
}

export function isInvalidCustomDateRange(value: DateRangeValue): boolean {
  return value.preset === "custom" && !isDateRangeValid(value);
}

/** @deprecated Use isDateRangeValid or isDateRangeComplete instead */
export function isDateRangeActive(value: DateRangeValue): boolean {
  return isDateRangeValid(value);
}

export function getCalendarViewDateFromRange(
  from: string | null,
  to: string | null,
): { year: number; month: number } {
  const reference = from ?? to;
  if (reference) {
    const { year, month } = parseDateInputValue(reference);
    return { year, month };
  }

  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

export function getDefaultOperationDateRange(referenceDate?: string): DateRangeValue {
  return resolveDateRangePreset("today", referenceDate);
}

export function getDefaultStatisticsDateRange(referenceDate?: string): DateRangeValue {
  return resolveDateRangePreset("last_30_days", referenceDate);
}

export function clearDateRangeValue(defaultValue?: DateRangeValue): DateRangeValue {
  return defaultValue ? { ...defaultValue } : { ...EMPTY_DATE_RANGE_VALUE };
}
