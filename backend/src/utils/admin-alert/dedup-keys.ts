/** Normalize UUID segment for durable dedup keys (SQL LOWER(CONVERT(...)) match). */
const normalizeId = (id: string): string => id.trim().toLowerCase();

export const buildUnavailableDedupKey = (
  assignmentId: string,
  scheduleVersion: number,
): string => `unavailable:${normalizeId(assignmentId)}:${scheduleVersion}`;

export const buildMissingCheckinDedupKey = (employeeWorkdayId: string): string =>
  `missing-checkin:${normalizeId(employeeWorkdayId)}`;

export const buildAbsencePendingDedupKey = (absenceRequestId: string): string =>
  `absence-pending:${normalizeId(absenceRequestId)}`;

/** Durable crossing id: allows future alerts after recovery + re-cross. */
export const buildAttendanceThresholdDedupKey = (
  employeeId: string,
  crossingSequence: number,
): string => `attendance-threshold:${normalizeId(employeeId)}:${crossingSequence}`;

/**
 * Dedup key for forwarded-location security alerts.
 * Bound to MessageSid so Twilio inbound retries do not enqueue a second alert.
 */
export const buildForwardedLocationDedupKey = (
  employeeId: string,
  messageSid: string,
): string => `forwarded-location:${normalizeId(employeeId)}:${messageSid.trim()}`;
