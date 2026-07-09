export const DEFAULT_COMPANY_OPERATIONAL_SETTINGS = {
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  defaultEarlyArrivalToleranceMinutes: 60,
  defaultLateArrivalToleranceMinutes: 90,
  defaultOperationStartTime: "20:30",
  defaultOperationEndTime: "03:00",
  geofenceReviewMarginMeters: null as number | null,
  confirmationReminderEnabled: true,
  confirmationReminderHoursBefore: 24,
  pendingOperationExpirationHours: 12,
} as const;

export type CompanyOperationalSettingsDefaults = typeof DEFAULT_COMPANY_OPERATIONAL_SETTINGS;

export const toCompanySettingsInput = (
  overrides: Partial<CompanyOperationalSettingsDefaults> = {},
) => ({
  operationTimezone:
    overrides.operationTimezone ?? DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
  defaultRadiusMeters:
    overrides.defaultRadiusMeters ?? DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultRadiusMeters,
  lateGraceMinutes:
    overrides.lateGraceMinutes ?? DEFAULT_COMPANY_OPERATIONAL_SETTINGS.lateGraceMinutes,
  earlyLeaveToleranceMinutes:
    overrides.earlyLeaveToleranceMinutes ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.earlyLeaveToleranceMinutes,
  requireCheckoutLocation:
    overrides.requireCheckoutLocation ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.requireCheckoutLocation,
  allowManualAttendanceCorrections:
    overrides.allowManualAttendanceCorrections ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.allowManualAttendanceCorrections,
  defaultEarlyArrivalToleranceMinutes:
    overrides.defaultEarlyArrivalToleranceMinutes ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
  defaultLateArrivalToleranceMinutes:
    overrides.defaultLateArrivalToleranceMinutes ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
  defaultOperationStartTime:
    overrides.defaultOperationStartTime ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
  defaultOperationEndTime:
    overrides.defaultOperationEndTime ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
  geofenceReviewMarginMeters:
    overrides.geofenceReviewMarginMeters ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.geofenceReviewMarginMeters,
  confirmationReminderEnabled:
    overrides.confirmationReminderEnabled ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.confirmationReminderEnabled,
  confirmationReminderHoursBefore:
    overrides.confirmationReminderHoursBefore ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.confirmationReminderHoursBefore,
  pendingOperationExpirationHours:
    overrides.pendingOperationExpirationHours ??
    DEFAULT_COMPANY_OPERATIONAL_SETTINGS.pendingOperationExpirationHours,
});

export const COMPANY_SETTINGS_LIMITS = {
  defaultRadiusMeters: { min: 10, max: 5000 },
  lateGraceMinutes: { min: 0, max: 240 },
  earlyLeaveToleranceMinutes: { min: 0, max: 240 },
  defaultEarlyArrivalToleranceMinutes: { min: 0, max: 240 },
  defaultLateArrivalToleranceMinutes: { min: 0, max: 240 },
  geofenceReviewMarginMeters: { min: 0, max: 5000 },
  confirmationReminderHoursBefore: { min: 1, max: 168 },
  pendingOperationExpirationHours: { min: 1, max: 168 },
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
