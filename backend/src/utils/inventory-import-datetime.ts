import * as XLSX from "xlsx";
import { env } from "../config/env";
import {
  CLIENT_DEFAULT_END_HOUR,
  CLIENT_DEFAULT_END_MINUTE,
  CLIENT_DEFAULT_START_HOUR,
  CLIENT_DEFAULT_START_MINUTE,
} from "../constants/inventory-import";

export interface InventoryDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  hasTime: boolean;
}

const OPERATION_TIMEZONE = env.BOT_OPERATION_TIMEZONE;

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: OPERATION_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((part) => part.type === type)?.value ?? "";

const pad2 = (value: number): string => String(value).padStart(2, "0");

const isMidnight = (hour: number, minute: number): boolean => hour === 0 && minute === 0;

export const normalizeInventoryDateParts = (parts: InventoryDateParts): InventoryDateParts => {
  if (!parts.hasTime || isMidnight(parts.hour, parts.minute)) {
    return {
      ...parts,
      hour: 0,
      minute: 0,
      hasTime: false,
    };
  }

  return parts;
};

export const dateToInventoryDateParts = (value: Date): InventoryDateParts => {
  const parts = dateTimeFormatter.formatToParts(value);
  const normalized = normalizeInventoryDateParts({
    year: Number(getPart(parts, "year")),
    month: Number(getPart(parts, "month")),
    day: Number(getPart(parts, "day")),
    hour: Number(getPart(parts, "hour")),
    minute: Number(getPart(parts, "minute")),
    hasTime: true,
  });

  return normalized;
};

export const formatInventoryDateParts = (parts: InventoryDateParts): string => {
  const date = `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
  if (!parts.hasTime) {
    return date;
  }

  return `${date} ${pad2(parts.hour)}:${pad2(parts.minute)}`;
};

const toComparableMs = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number => Date.UTC(year, month - 1, day, hour, minute);

const readZonedParts = (instant: Date) => {
  const parts = dateTimeFormatter.formatToParts(instant);
  return {
    year: Number(getPart(parts, "year")),
    month: Number(getPart(parts, "month")),
    day: Number(getPart(parts, "day")),
    hour: Number(getPart(parts, "hour")),
    minute: Number(getPart(parts, "minute")),
  };
};

export const localPartsToIso = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): { iso: string } | { error: string } => {
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
      return { iso: new Date(guess).toISOString() };
    }

    const actualMs = toComparableMs(zoned.year, zoned.month, zoned.day, zoned.hour, zoned.minute);
    guess += desiredMs - actualMs;
  }

  return { error: "No se pudo interpretar la fecha en la zona horaria del sistema" };
};

const addDays = (year: number, month: number, day: number, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

export const parseExcelSerialNumber = (serial: number): InventoryDateParts | null => {
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }

  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) {
    return null;
  }

  return normalizeInventoryDateParts({
    year: parsed.y,
    month: parsed.m,
    day: parsed.d,
    hour: parsed.H,
    minute: parsed.M,
    hasTime: parsed.H !== 0 || parsed.M !== 0 || parsed.S !== 0,
  });
};

export const parseInventoryImportDateValue = (
  raw: string,
): { parts: InventoryDateParts } | { error: string } => {
  const value = raw.trim();
  if (!value) {
    return { error: "La fecha es obligatoria" };
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    const serial = parseExcelSerialNumber(Number(value));
    if (serial) {
      return { parts: serial };
    }

    return { error: "Número de fecha de Excel no válido" };
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Fecha inválida" };
    }

    return { parts: dateToInventoryDateParts(parsed) };
  }

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    return {
      parts: normalizeInventoryDateParts({
        year: Number(isoDateMatch[1]),
        month: Number(isoDateMatch[2]),
        day: Number(isoDateMatch[3]),
        hour: 0,
        minute: 0,
        hasTime: false,
      }),
    };
  }

  const isoDateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (isoDateTimeMatch) {
    return {
      parts: normalizeInventoryDateParts({
        year: Number(isoDateTimeMatch[1]),
        month: Number(isoDateTimeMatch[2]),
        day: Number(isoDateTimeMatch[3]),
        hour: Number(isoDateTimeMatch[4]),
        minute: Number(isoDateTimeMatch[5]),
        hasTime: true,
      }),
    };
  }

  const latinDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (latinDateMatch) {
    return {
      parts: normalizeInventoryDateParts({
        year: Number(latinDateMatch[3]),
        month: Number(latinDateMatch[2]),
        day: Number(latinDateMatch[1]),
        hour: 0,
        minute: 0,
        hasTime: false,
      }),
    };
  }

  const latinDateTimeMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (latinDateTimeMatch) {
    return {
      parts: normalizeInventoryDateParts({
        year: Number(latinDateTimeMatch[3]),
        month: Number(latinDateTimeMatch[2]),
        day: Number(latinDateTimeMatch[1]),
        hour: Number(latinDateTimeMatch[4]),
        minute: Number(latinDateTimeMatch[5]),
        hasTime: true,
      }),
    };
  }

  return {
    error: "Formato de fecha no válido. Use DD/MM/YYYY, YYYY-MM-DD o DD/MM/YYYY HH:mm",
  };
};

export const parseInventoryImportDateTime = (
  raw: string,
): { iso: string } | { error: string } => {
  const parsed = parseInventoryImportDateValue(raw);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { year, month, day, hour, minute, hasTime } = parsed.parts;
  if (!hasTime) {
    return { error: "La fecha debe incluir hora para este formato de importación" };
  }

  return localPartsToIso(year, month, day, hour, minute);
};

export const buildClientInventorySchedule = (
  rawFecha: string,
): {
  scheduledStart: string;
  scheduledEnd: string;
  parsedInventoryDate: string;
  scheduledStartDisplay: string;
  scheduledEndDisplay: string;
} | { error: string } => {
  const parsed = parseInventoryImportDateValue(rawFecha);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const { year, month, day, hasTime } = parsed.parts;
  const startHour = hasTime ? parsed.parts.hour : CLIENT_DEFAULT_START_HOUR;
  const startMinute = hasTime ? parsed.parts.minute : CLIENT_DEFAULT_START_MINUTE;

  const startIso = localPartsToIso(year, month, day, startHour, startMinute);
  if ("error" in startIso) {
    return { error: startIso.error };
  }

  const endDate = addDays(year, month, day, 1);
  const endIso = localPartsToIso(
    endDate.year,
    endDate.month,
    endDate.day,
    CLIENT_DEFAULT_END_HOUR,
    CLIENT_DEFAULT_END_MINUTE,
  );
  if ("error" in endIso) {
    return { error: endIso.error };
  }

  return {
    scheduledStart: startIso.iso,
    scheduledEnd: endIso.iso,
    parsedInventoryDate: formatInventoryDateParts({ year, month, day, hour: 0, minute: 0, hasTime: false }),
    scheduledStartDisplay: hasTime
      ? `${pad2(startHour)}:${pad2(startMinute)}`
      : `${pad2(CLIENT_DEFAULT_START_HOUR)}:${pad2(CLIENT_DEFAULT_START_MINUTE)} (default)`,
    scheduledEndDisplay: `${pad2(CLIENT_DEFAULT_END_HOUR)}:${pad2(
      CLIENT_DEFAULT_END_MINUTE,
    )} día siguiente (default)`,
  };
};
