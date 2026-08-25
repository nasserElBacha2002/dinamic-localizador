import { env } from "../../config/env";

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

/**
 * Throttle key for forwarded-location security alerts.
 * Bucket = floor(unixMs / (throttleMinutes * 60_000)).
 */
export const buildForwardedLocationDedupKey = (
  employeeId: string,
  at: Date = new Date(),
  throttleMinutes = env.ADMIN_ALERT_FORWARDED_THROTTLE_MINUTES,
): string => {
  const windowMs = Math.max(1, throttleMinutes) * 60_000;
  const bucket = Math.floor(at.getTime() / windowMs);
  return `forwarded:${normalizeId(employeeId)}:${bucket}`;
};

/** Durable crossing id: allows future alerts after recovery + re-cross. */
export const buildAttendanceThresholdDedupKey = (
  employeeId: string,
  crossingSequence: number,
): string => `attendance-threshold:${normalizeId(employeeId)}:${crossingSequence}`;
