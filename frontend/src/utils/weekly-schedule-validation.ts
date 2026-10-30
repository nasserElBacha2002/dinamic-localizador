import { WEEKDAYS, type WeeklyScheduleDay } from "../types/schedule";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isValidScheduleTime = (value: string): boolean => TIME_PATTERN.test(value);

/** Mirrors backend validateWeeklyScheduleDays for client-side guards before API calls. */
export function validateWeeklyScheduleDays(
  days: WeeklyScheduleDay[],
): { valid: true } | { valid: false; code: string; message: string } {
  if (days.length !== WEEKDAYS.length) {
    return {
      valid: false,
      code: "SCHEDULE_INCOMPLETE_WEEK",
      message: "El horario semanal debe incluir los siete días de la semana",
    };
  }

  const seen = new Set<WeeklyScheduleDay["dayOfWeek"]>();
  for (const day of days) {
    if (seen.has(day.dayOfWeek)) {
      return {
        valid: false,
        code: "SCHEDULE_DUPLICATE_WEEKDAY",
        message: "El horario semanal contiene días repetidos",
      };
    }
    seen.add(day.dayOfWeek);

    if (!WEEKDAYS.includes(day.dayOfWeek)) {
      return {
        valid: false,
        code: "SCHEDULE_INVALID_WEEKDAY",
        message: "Revisá los horarios configurados para los días laborables",
      };
    }

    if (day.isEnabled) {
      if (!day.startTime || !day.endTime) {
        return {
          valid: false,
          code: "SCHEDULE_ENABLED_DAY_MISSING_TIMES",
          message: "Revisá los horarios configurados para los días laborables",
        };
      }
      if (!isValidScheduleTime(day.startTime) || !isValidScheduleTime(day.endTime)) {
        return {
          valid: false,
          code: "SCHEDULE_INVALID_TIME",
          message: "Revisá los horarios configurados para los días laborables",
        };
      }
      if (day.startTime === day.endTime) {
        return {
          valid: false,
          code: "SCHEDULE_EQUAL_START_END",
          message: "La hora de inicio y fin no pueden ser iguales",
        };
      }
    } else if (day.startTime || day.endTime) {
      return {
        valid: false,
        code: "SCHEDULE_DISABLED_DAY_HAS_TIMES",
        message: "Revisá los horarios configurados para los días laborables",
      };
    }
  }

  const enabledCount = days.filter((day) => day.isEnabled).length;
  if (enabledCount === 0) {
    return {
      valid: false,
      code: "SCHEDULE_NO_ENABLED_DAYS",
      message: "Configurá al menos un día de trabajo para esta operación",
    };
  }

  return { valid: true };
}

export function isWeeklyScheduleDraftValid(days: WeeklyScheduleDay[]): boolean {
  return validateWeeklyScheduleDays(days).valid;
}
