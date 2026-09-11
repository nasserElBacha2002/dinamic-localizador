export const SYSTEM_LOG_LEVELS = ["error", "warn", "info"] as const;
export type SystemLogLevel = (typeof SYSTEM_LOG_LEVELS)[number];

export const SYSTEM_LOG_MODULES = [
  "http",
  "whatsapp-webhook",
  "twilio-outbound",
  "attendance-reminder",
  "operation-lifecycle",
  "admin-alert",
  "payroll-notification",
  "absence",
  "message-cost-sync",
  "system-log-retention",
  "operation-assignment-notification",
  "company-deletion",
  "recurring-workday",
] as const;
export type SystemLogModule = (typeof SYSTEM_LOG_MODULES)[number] | (string & {});

export const SYSTEM_LOG_EVENTS = [
  "http.request.failed",
  "http.request.rejected",
  "whatsapp.webhook.failed",
  "twilio.message.send.failed",
  "attendance-reminder.run.failed",
  "attendance-reminder.run.completed",
  "operation-lifecycle.run.failed",
  "operation-lifecycle.run.completed",
  "admin-alert.send.failed",
  "admin-alert.run.failed",
  "payroll-notification.send.failed",
  "payroll-notification.run.failed",
  "absence-sync.run.failed",
  "absence-cleanup.run.failed",
  "message-cost-sync.run.failed",
  "message-cost-sync.run.completed",
  "system-log-retention.completed",
  "system-log-retention.failed",
  "operation-assignment-notification.run.failed",
  "company-deletion.run.failed",
  "recurring-workday.run.failed",
  "process.unhandledRejection",
  "process.uncaughtException",
] as const;
export type SystemLogEvent = (typeof SYSTEM_LOG_EVENTS)[number] | (string & {});

/** INFO events that may be persisted when allowlisted in env. */
export const DEFAULT_SYSTEM_LOGS_INFO_EVENT_ALLOWLIST = [
  "system-log-retention.completed",
  "attendance-reminder.run.completed",
  "operation-lifecycle.run.completed",
  "message-cost-sync.run.completed",
] as const;
