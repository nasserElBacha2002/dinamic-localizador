/** Distributed lock resource for WhatsApp retention cleanup (sp_getapplock Session owner). */
export const WHATSAPP_RETENTION_LOCK_RESOURCE = "whatsapp-retention-cleanup";

export const WHATSAPP_RETENTION_TABLE_KEYS = [
  "whatsapp_flow_candidates",
  "whatsapp_flow_steps",
  "whatsapp_provider_events",
  "whatsapp_flow_executions",
  "whatsapp_admin_alert_notification_send_attempts",
  "whatsapp_payroll_receipt_notification_send_attempts",
  "whatsapp_attendance_notifications",
  "whatsapp_admin_alert_notifications",
  "whatsapp_payroll_receipt_notifications",
  "whatsapp_payroll_receipt_query_deliveries",
  "whatsapp_messages",
  "whatsapp_webhook_events",
  "whatsapp_conversations",
  "bot_sessions",
  "bot_simulation_sessions",
  "whatsapp_turn_classifications",
  "whatsapp_system_interactions",
  // Quota tables: children before parents (FK-soft refs, but order preserves integrity).
  "whatsapp_quota_limit_notices",
  "whatsapp_quota_outbound_reservations",
  "whatsapp_quota_turn_admissions",
  "whatsapp_quota_employee_periods",
  "whatsapp_quota_company_periods",
  // Independent cost/audit TTL (gated by WHATSAPP_COST_LEDGER_RETENTION_ENABLED).
  "whatsapp_message_cost_ledger",
] as const;

/**
 * DEBT (replacement FK): `replacement_request_notifications` references
 * `whatsapp_admin_alert_notifications` with NO ACTION and is functional domain
 * history (quick-reply correlation), not a disposable WhatsApp technical row.
 * It is intentionally NOT on the 30-day WhatsApp retention whitelist.
 * Do not CASCADE. A domain retention policy is required before purge.
 */
export const REPLACEMENT_NOTIFICATIONS_RETENTION_DEBT =
  "replacement_request_notifications blocks admin-alert purge via NO ACTION FK";


export type WhatsappRetentionTableKey = (typeof WHATSAPP_RETENTION_TABLE_KEYS)[number];

/** Whitelist used in retention SQL — unknown statuses are never purged. */
export const FLOW_EXECUTION_TERMINAL_STATUSES = [
  "COMPLETED",
  "FAILED",
  "PARTIALLY_RECORDED",
] as const;

export const flowExecutionTerminalStatusesSqlInList = (): string =>
  FLOW_EXECUTION_TERMINAL_STATUSES.map((status) => `N'${status}'`).join(", ");
