/**
 * Temporal semantics for dynamic admin attendance alerts.
 *
 * Selection (SQL): dueAt computed with DATEADD on UTC DateTime2 columns
 * (scheduled_start / expected_start_at / expected_end_at). Window:
 *   dueAt <= @referenceAt
 *   AND dueAt >= @referenceAt - admin_alert_max_lateness_minutes
 *   AND dueAt >= admin_alerts_enabled_at
 *
 * Send-time (TypeScript): utils/admin-alert/dynamic-attendance-due-at.ts
 * isDueWithinMaxLateness(dueAt, now, maxLateness, watermark) — same inclusive
 * window; now is injectable via Date at call sites.
 *
 * Presentation timezone (operation_timezone) is for template display only;
 * eligibility is always UTC instants.
 *
 * Overnight ops (e.g. 20:30→03:00 local): expected_end_at crosses midnight in UTC;
 * checkout dueAt = expected_end_at + admin_missing_checkout_delay_minutes.
 */
export const DYNAMIC_ATTENDANCE_TEMPORAL_SOURCE_OF_TRUTH =
  "SQL DATEADD (selection) + isDueWithinMaxLateness (send-time)" as const;
