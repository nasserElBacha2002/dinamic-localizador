import { ATTENDANCE_REMINDER_LEAD_MINUTES } from "../constants/attendance-notification";

export interface ReminderTimeWindow {
  windowStart: Date;
  windowEnd: Date;
  referenceAt: Date;
}

export const buildReminderTargetWindow = (
  referenceAt: Date,
  leadMinutes: number = ATTENDANCE_REMINDER_LEAD_MINUTES,
): ReminderTimeWindow => {
  const windowStart = new Date(referenceAt.getTime() + leadMinutes * 60_000);
  const windowEnd = new Date(windowStart.getTime() + 60_000);

  return {
    referenceAt,
    windowStart,
    windowEnd,
  };
};
