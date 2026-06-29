import { ATTENDANCE_REMINDER_LEAD_MINUTES } from "../constants/attendance-notification";

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

/** @deprecated Use buildReminderDueWindow */
export const buildReminderTargetWindow = buildReminderDueWindow;
