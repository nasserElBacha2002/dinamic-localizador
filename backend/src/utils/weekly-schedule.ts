import { WEEKDAYS, type Weekday, weekdayToNumber } from "../constants/weekday";
import type { WeeklyScheduleDay } from "../types/schedule";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidScheduleTime = (value: string): boolean => TIME_PATTERN.test(value);

export const isOvernightSchedule = (startTime: string, endTime: string): boolean =>
  endTime <= startTime;

export const normalizeWeeklyScheduleDays = (
  days: WeeklyScheduleDay[],
): WeeklyScheduleDay[] => {
  const byWeekday = new Map(days.map((day) => [day.dayOfWeek, day]));

  return WEEKDAYS.map((dayOfWeek) => {
    const existing = byWeekday.get(dayOfWeek);
    if (!existing || !existing.isEnabled) {
      return {
        dayOfWeek,
        isEnabled: false,
        startTime: null,
        endTime: null,
      };
    }

    return {
      dayOfWeek,
      isEnabled: true,
      startTime: existing.startTime,
      endTime: existing.endTime,
    };
  });
};

export const weeklySchedulesEqual = (
  left: WeeklyScheduleDay[],
  right: WeeklyScheduleDay[],
): boolean => {
  const normalizedLeft = normalizeWeeklyScheduleDays(left);
  const normalizedRight = normalizeWeeklyScheduleDays(right);

  return normalizedLeft.every((day, index) => {
    const other = normalizedRight[index];
    return (
      day.dayOfWeek === other.dayOfWeek &&
      day.isEnabled === other.isEnabled &&
      day.startTime === other.startTime &&
      day.endTime === other.endTime
    );
  });
};

export const validateWeeklyScheduleDays = (
  days: WeeklyScheduleDay[],
): { valid: true } | { valid: false; code: string; message: string } => {
  if (days.length !== WEEKDAYS.length) {
    return {
      valid: false,
      code: "SCHEDULE_INCOMPLETE_WEEK",
      message: "El horario semanal debe incluir los siete días de la semana",
    };
  }

  const seen = new Set<Weekday>();
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
};

export const buildScheduleSummaryLabel = (days: WeeklyScheduleDay[]): {
  summaryLabel: string;
  enabledWeekdayCount: number;
  hasCustomWeekdayHours: boolean;
} => {
  const normalized = normalizeWeeklyScheduleDays(days);
  const enabled = normalized.filter((day) => day.isEnabled);
  const enabledWeekdayCount = enabled.length;

  if (enabled.length === 0) {
    return {
      summaryLabel: "Sin días laborables",
      enabledWeekdayCount: 0,
      hasCustomWeekdayHours: false,
    };
  }

  const signature = (day: WeeklyScheduleDay) => `${day.startTime}-${day.endTime}`;
  const uniqueSignatures = new Set(enabled.map(signature));
  const hasCustomWeekdayHours = uniqueSignatures.size > 1;

  if (!hasCustomWeekdayHours && enabled.length > 0) {
    const first = enabled[0];
    const weekdayOrder = enabled.map((day) => weekdayToNumber(day.dayOfWeek));
    const isContiguous =
      weekdayOrder.length > 0 &&
      weekdayOrder.every((value, index) => index === 0 || value === weekdayOrder[index - 1] + 1);

    if (isContiguous && enabled.length >= 2) {
      return {
        summaryLabel: `${enabledWeekdayCount} días · ${first.startTime}–${first.endTime}`,
        enabledWeekdayCount,
        hasCustomWeekdayHours: false,
      };
    }

    return {
      summaryLabel: `${first.startTime}–${first.endTime}`,
      enabledWeekdayCount,
      hasCustomWeekdayHours: false,
    };
  }

  return {
    summaryLabel: "Horario semanal personalizado",
    enabledWeekdayCount,
    hasCustomWeekdayHours: true,
  };
};
