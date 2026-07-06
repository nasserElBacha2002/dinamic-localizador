import { normalizeIntentText, parseOperationSelection } from "./intent";

const WORKDAY_KEYWORDS = [
  "mi jornada",
  "jornada",
  "hoy",
  "que tengo hoy",
  "qué tengo hoy",
  "mi turno",
  "turno de hoy",
] as const;

const UPCOMING_KEYWORDS = [
  "mis turnos",
  "proximos turnos",
  "próximos turnos",
  "mis trabajos",
  "proximos trabajos",
  "próximos trabajos",
  "agenda",
  "proximos trabajos",
  "próximos trabajos",
] as const;

const CONFIRM_KEYWORDS = [
  "confirmo asistencia",
  "voy a asistir",
  "confirmar turno",
  "confirmar trabajo",
  "confirmo turno",
] as const;

const UNAVAILABILITY_KEYWORDS = [
  "no puedo asistir",
  "no puedo ir",
  "no estoy disponible",
  "avisar no disponibilidad",
  "no disponible",
  "no puedo turno",
] as const;

const matchesKeyword = (body: string, keywords: readonly string[]): boolean => {
  const normalized = normalizeIntentText(body);
  return keywords.some(
    (keyword) => normalized === keyword || normalized.startsWith(`${keyword} `),
  );
};

export const isWorkdayQueryIntent = (body: string): boolean => matchesKeyword(body, WORKDAY_KEYWORDS);

export const isUpcomingAssignmentsIntent = (body: string): boolean =>
  matchesKeyword(body, UPCOMING_KEYWORDS);

export const isConfirmAttendanceIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  if (normalized.startsWith("confirmar ") && /\d+\s*$/.test(normalized)) {
    return true;
  }
  return matchesKeyword(body, CONFIRM_KEYWORDS);
};

export const isUnavailabilityIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  if (normalized.startsWith("no puedo turno ") && /\d+\s*$/.test(normalized)) {
    return true;
  }
  return matchesKeyword(body, UNAVAILABILITY_KEYWORDS);
};

export const parseOptionalAssignmentSelection = (body: string): number | null => {
  const normalized = normalizeIntentText(body);
  const trailingNumber = normalized.match(/(\d+)\s*$/);
  if (trailingNumber) {
    const value = Number.parseInt(trailingNumber[1], 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return parseOperationSelection(body);
};
