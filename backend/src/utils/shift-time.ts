import { DateTime } from "luxon";

export type ShiftTimeParseErrorCode = "INVALID_SHIFT_TIME" | "SHIFT_START_EQUALS_END";

export class ShiftTimeError extends Error {
  readonly code: ShiftTimeParseErrorCode;

  constructor(code: ShiftTimeParseErrorCode, message: string) {
    super(message);
    this.name = "ShiftTimeError";
    this.code = code;
  }
}

/**
 * Accepts HH:mm or HH:mm:ss.
 * Non-zero seconds are rejected (not silently truncated).
 * Zero seconds normalize to HH:mm.
 */
export const normalizeShiftTime = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ShiftTimeError("INVALID_SHIFT_TIME", "Horario de turno vacío.");
  }

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) {
    throw new ShiftTimeError("INVALID_SHIFT_TIME", "Formato de horario inválido.");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] !== undefined ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    throw new ShiftTimeError("INVALID_SHIFT_TIME", "Horario fuera de rango.");
  }

  if (seconds !== 0) {
    throw new ShiftTimeError(
      "INVALID_SHIFT_TIME",
      "Los segundos deben ser 00 o omitirse (no se truncan).",
    );
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export const isValidShiftHhMm = (value: string): boolean => {
  try {
    normalizeShiftTime(value);
    return true;
  } catch {
    return false;
  }
};

export const parseShiftTimeToMinutes = (value: string): number => {
  const normalized = normalizeShiftTime(value);
  const [h, m] = normalized.split(":").map((part) => Number(part));
  return h * 60 + m;
};

/** Validates both times; throws ShiftTimeError with precise code. */
export const assertShiftTimesDistinct = (startTime: string, endTime: string): void => {
  const start = normalizeShiftTime(startTime);
  const end = normalizeShiftTime(endTime);
  if (parseShiftTimeToMinutes(start) === parseShiftTimeToMinutes(end)) {
    throw new ShiftTimeError(
      "SHIFT_START_EQUALS_END",
      "La hora de inicio y fin del turno no pueden ser iguales.",
    );
  }
};

export const isOvernightShift = (startTime: string, endTime: string): boolean =>
  parseShiftTimeToMinutes(endTime) < parseShiftTimeToMinutes(startTime);

export const assertEffectiveRange = (effectiveFrom: string, effectiveUntil: string | null): void => {
  const from = DateTime.fromISO(effectiveFrom, { zone: "utc" });
  if (!from.isValid) {
    throw new Error("INVALID_EFFECTIVE_FROM");
  }
  if (effectiveUntil == null) {
    return;
  }
  const until = DateTime.fromISO(effectiveUntil, { zone: "utc" });
  if (!until.isValid) {
    throw new Error("INVALID_EFFECTIVE_UNTIL");
  }
  if (until.toISODate()! < from.toISODate()!) {
    throw new Error("EFFECTIVE_UNTIL_BEFORE_FROM");
  }
};

/**
 * Inclusive date-range overlap (same semantics as assignment periods).
 * Concurrent inserts for the same (company, operation, code) must hold
 * Transaction applock + SERIALIZABLE UPDLOCK (see operationShiftRepository.createWithOverlapGuard).
 */
export const dateRangesOverlap = (
  aFrom: string,
  aUntil: string | null,
  bFrom: string,
  bUntil: string | null,
): boolean => {
  const aEnd = aUntil ?? "9999-12-31";
  const bEnd = bUntil ?? "9999-12-31";
  return aFrom <= bEnd && bFrom <= aEnd;
};
