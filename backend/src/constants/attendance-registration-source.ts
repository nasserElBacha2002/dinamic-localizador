export const ATTENDANCE_REGISTRATION_SOURCES = [
  "WHATSAPP",
  "MANUAL",
  "IMPORT",
  "SYSTEM",
] as const;

export type AttendanceRegistrationSource =
  (typeof ATTENDANCE_REGISTRATION_SOURCES)[number];

export const MANUAL_ATTENDANCE_AUDIT_ACTIONS = [
  "MANUAL_CHECK_IN",
  "MANUAL_CHECK_OUT",
  "MANUAL_CHECK_IN_EDIT",
  "MANUAL_CHECK_OUT_EDIT",
] as const;

export type ManualAttendanceAuditAction =
  (typeof MANUAL_ATTENDANCE_AUDIT_ACTIONS)[number];
