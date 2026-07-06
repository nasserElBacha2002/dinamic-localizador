import {
  ATTENDANCE_REMINDER_LEAD_MINUTES,
  NO_CHECKIN_AT_START_WINDOW_MINUTES,
} from "../constants/attendance-notification";

export interface ReminderTimeWindow {
  windowStart: Date;
  windowEnd: Date;
  referenceAt: Date;
}

export const buildReminderDueWindow = (
  referenceAt: Date,
  leadMinutes: number = ATTENDANCE_REMINDER_LEAD_MINUTES,
): ReminderTimeWindow => {
  const windowStart = referenceAt;
  const windowEnd = new Date(referenceAt.getTime() + leadMinutes * 60_000);

  return {
    referenceAt,
    windowStart,
    windowEnd,
  };
};

export const buildInventoryStartDueWindow = (
  referenceAt: Date,
  windowMinutes: number = NO_CHECKIN_AT_START_WINDOW_MINUTES,
): ReminderTimeWindow => {
  const windowStart = new Date(referenceAt.getTime() - windowMinutes * 60_000);

  return {
    referenceAt,
    windowStart,
    windowEnd: referenceAt,
  };
};

/** Operations whose reminder threshold (start - hoursBefore) is due at referenceAt. */
export const buildConfirmationReminderDueWindow = (
  referenceAt: Date,
  hoursBefore: number,
): ReminderTimeWindow => {
  const windowStart = new Date(referenceAt.getTime() - 60 * 60_000);
  const windowEnd = referenceAt;

  return {
    referenceAt,
    windowStart,
    windowEnd,
    hoursBefore,
  } as ReminderTimeWindow & { hoursBefore: number };
};

export const isConfirmationReminderThresholdReached = (
  scheduledStart: Date,
  referenceAt: Date,
  hoursBefore: number,
): boolean => {
  const thresholdMs = scheduledStart.getTime() - hoursBefore * 60 * 60_000;
  return referenceAt.getTime() >= thresholdMs && referenceAt.getTime() < scheduledStart.getTime();
};

/** @deprecated Use buildReminderDueWindow */
export const buildReminderTargetWindow = buildReminderDueWindow;
