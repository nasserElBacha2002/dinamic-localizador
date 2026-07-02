export interface BotRuntimeSettings {
  companyId: string;
  operationTimezone: string;
  defaultRadiusMeters: number;
  geofenceReviewMarginMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  /** Used by admin/manual correction flows; not applied to WhatsApp check-in/check-out validation yet. */
  allowManualAttendanceCorrections: boolean;
  sessionTtlMinutes: number;
}

/** Applies only to company_settings-backed operational fields, not env-only fields (session TTL, review margin). */
export type BotRuntimeSettingsSource = "company_settings" | "operational_defaults";
