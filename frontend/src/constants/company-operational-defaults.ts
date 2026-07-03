import { DEFAULT_OPERATION_TIMEZONE } from "./operation-timezones";

export const DEFAULT_COMPANY_OPERATIONAL_DEFAULTS = {
  operationTimezone: DEFAULT_OPERATION_TIMEZONE,
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
} as const;
