/** Attendance threshold alert bands (Phase D). */
export const ATTENDANCE_ALERT_BANDS = [
  "ABOVE_OR_EQUAL",
  "BELOW",
  "INSUFFICIENT_SAMPLE",
] as const;

export type AttendanceAlertBand = (typeof ATTENDANCE_ALERT_BANDS)[number];

export const ATTENDANCE_ALERT_DEFAULTS = {
  thresholdPercent: 80,
  windowDays: 30,
  minimumWorkdays: 5,
  cooldownDays: 7,
  enabled: false,
} as const;

export const ATTENDANCE_ALERT_LIMITS = {
  thresholdPercent: { min: 1, max: 100 },
  windowDays: { min: 7, max: 365 },
  minimumWorkdays: { min: 1, max: 100 },
  cooldownDays: { min: 1, max: 90 },
} as const;

export const ATTENDANCE_ALERT_EVALUATION_MAX_ATTEMPTS = 5;
export const ATTENDANCE_ALERT_EVALUATION_LEASE_SECONDS = 60;
export const ATTENDANCE_ALERT_EVALUATION_BATCH_SIZE = 25;
