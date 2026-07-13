import { formatDateOnly, isDateOnlyString } from "./date-only";

const TIMEZONE = "America/Argentina/Buenos_Aires";
/** Argentina (America/Argentina/Buenos_Aires) is UTC-3 without DST since 2009. */
const ARGENTINA_UTC_OFFSET_HOURS = 3;

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  if (isDateOnlyString(iso)) {
    return formatDateOnly(iso);
  }

  return dateFormatter.format(new Date(iso));
}

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  return timeFormatter.format(new Date(iso));
}

export function isoToDatetimeLocal(iso: string): string {
  const parts = dateTimeFormatter.formatToParts(new Date(iso));
  const year = getPart(parts, "year");
  const month = getPart(parts, "month");
  const day = getPart(parts, "day");
  const hour = getPart(parts, "hour");
  const minute = getPart(parts, "minute");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toComparableMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

function readZonedParts(instant: Date) {
  const parts = dateTimeFormatter.formatToParts(instant);
  return {
    year: Number(getPart(parts, "year")),
    month: Number(getPart(parts, "month")),
    day: Number(getPart(parts, "day")),
    hour: Number(getPart(parts, "hour")),
    minute: Number(getPart(parts, "minute")),
  };
}

export function datetimeLocalToIso(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  const desiredMs = toComparableMs(year, month, day, hour, minute);
  let guess = desiredMs;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const zoned = readZonedParts(new Date(guess));
    if (
      zoned.year === year &&
      zoned.month === month &&
      zoned.day === day &&
      zoned.hour === hour &&
      zoned.minute === minute
    ) {
      return new Date(guess).toISOString();
    }

    const actualMs = toComparableMs(zoned.year, zoned.month, zoned.day, zoned.hour, zoned.minute);
    guess += desiredMs - actualMs;
  }

  return new Date(guess).toISOString();
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() + 1 === month &&
    utcDate.getUTCDate() === day
  );
}

function parseDateInputValue(dateValue: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) {
    throw new Error(`Formato de fecha inválido: ${dateValue}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Formato de fecha inválido: ${dateValue}`);
  }

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`Fecha inválida: ${dateValue}`);
  }

  return { year, month, day };
}

export function dateInputToIsoStart(dateValue: string): string {
  const { year, month, day } = parseDateInputValue(dateValue);
  return new Date(
    Date.UTC(year, month - 1, day, ARGENTINA_UTC_OFFSET_HOURS, 0, 0, 0),
  ).toISOString();
}

export function dateInputToIsoEnd(dateValue: string): string {
  const { year, month, day } = parseDateInputValue(dateValue);
  return new Date(
    Date.UTC(year, month - 1, day + 1, ARGENTINA_UTC_OFFSET_HOURS - 1, 59, 0, 0),
  ).toISOString();
}

export function getCurrentDatetimeLocal(): string {
  return isoToDatetimeLocal(new Date().toISOString());
}

function toDateInputValue(date: Date): string {
  const parts = dateFormatter.formatToParts(date);
  return `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`;
}

export function getTodayDateInput(): string {
  return toDateInputValue(new Date());
}

export function getDefaultStatisticsDateFrom(): string {
  const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return toDateInputValue(date);
}

export function getDefaultStatisticsDateTo(): string {
  return toDateInputValue(new Date());
}
