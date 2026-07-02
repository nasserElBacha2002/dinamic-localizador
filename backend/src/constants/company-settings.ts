export const DEFAULT_COMPANY_OPERATIONAL_SETTINGS = {
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
} as const;

export const COMPANY_SETTINGS_LIMITS = {
  defaultRadiusMeters: { min: 10, max: 5000 },
  lateGraceMinutes: { min: 0, max: 240 },
  earlyLeaveToleranceMinutes: { min: 0, max: 240 },
  operationTimezoneMaxLength: 80,
} as const;

export const isValidOperationTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};
