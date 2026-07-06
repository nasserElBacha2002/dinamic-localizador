import { getDateIsoInTimezone } from "./absence-date";

/**
 * Work date is the local calendar date of the operation's expected start instant.
 * Overnight operations belong to the start day (e.g. Mon 22:00–Tue 06:00 → Monday).
 */
export const resolveWorkDateFromScheduledStart = (
  scheduledStart: Date | string,
  timezone: string,
): string => {
  const at = scheduledStart instanceof Date ? scheduledStart : new Date(scheduledStart);
  return getDateIsoInTimezone(at, timezone);
};
