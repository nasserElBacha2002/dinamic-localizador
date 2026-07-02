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

/** @deprecated Use buildReminderDueWindow */
export const buildReminderTargetWindow = buildReminderDueWindow;
