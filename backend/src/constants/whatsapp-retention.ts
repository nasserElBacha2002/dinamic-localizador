/** Distributed lock resource for WhatsApp retention cleanup (sp_getapplock Session owner). */
export const WHATSAPP_RETENTION_LOCK_RESOURCE = "whatsapp-retention-cleanup";

export const WHATSAPP_RETENTION_TABLE_KEYS = [
  "whatsapp_flow_candidates",
  "whatsapp_flow_steps",
  "whatsapp_provider_events",
  "whatsapp_flow_executions",
  "whatsapp_admin_alert_notification_send_attempts",
  "whatsapp_operation_assignment_notification_send_attempts",
  "whatsapp_payroll_receipt_notification_send_attempts",
  "whatsapp_attendance_notifications",
  "whatsapp_admin_alert_notifications",
  "whatsapp_operation_assignment_notifications",
  "whatsapp_payroll_receipt_notifications",
  "whatsapp_payroll_receipt_query_deliveries",
  "whatsapp_messages",
  "whatsapp_webhook_events",
  "whatsapp_conversations",
  "bot_sessions",
  "bot_simulation_sessions",
] as const;

export type WhatsappRetentionTableKey = (typeof WHATSAPP_RETENTION_TABLE_KEYS)[number];

/** Whitelist used in retention SQL — unknown statuses are never purged. */
export const FLOW_EXECUTION_TERMINAL_STATUSES = [
  "COMPLETED",
  "FAILED",
  "PARTIALLY_RECORDED",
] as const;

export const flowExecutionTerminalStatusesSqlInList = (): string =>
  FLOW_EXECUTION_TERMINAL_STATUSES.map((status) => `N'${status}'`).join(", ");
