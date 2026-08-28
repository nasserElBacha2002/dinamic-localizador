import {
  ATTENDANCE_NOTIFICATION_TERMINAL_STATUSES,
  BOT_SESSION_TERMINAL_STATES,
  FLOW_EXECUTION_TERMINAL_STATUSES,
  PAYROLL_NOTIFICATION_TERMINAL_STATUSES,
  WHATSAPP_CONVERSATION_ACTIVE_STATUS,
  WHATSAPP_OUTBOX_PENDING_STATUSES,
  WHATSAPP_OUTBOX_TERMINAL_STATUSES,
} from "../constants/whatsapp-retention";

export const computeRetentionCutoff = (nowUtc: Date, retentionDays: number): Date => {
  const cutoff = new Date(nowUtc.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
};

export const isBotSessionTerminalState = (state: string): boolean =>
  (BOT_SESSION_TERMINAL_STATES as readonly string[]).includes(state);

export const isAttendanceNotificationTerminalStatus = (status: string): boolean =>
  (ATTENDANCE_NOTIFICATION_TERMINAL_STATUSES as readonly string[]).includes(status);

export const isOutboxTerminalStatus = (status: string): boolean =>
  (WHATSAPP_OUTBOX_TERMINAL_STATUSES as readonly string[]).includes(status);

export const isOutboxPendingStatus = (status: string): boolean =>
  (WHATSAPP_OUTBOX_PENDING_STATUSES as readonly string[]).includes(status);

export const isPayrollNotificationTerminalStatus = (status: string): boolean =>
  (PAYROLL_NOTIFICATION_TERMINAL_STATUSES as readonly string[]).includes(status);

export const isFlowExecutionTerminalStatus = (status: string): boolean =>
  (FLOW_EXECUTION_TERMINAL_STATUSES as readonly string[]).includes(status);

export type WebhookRetentionInput = {
  processingStatus: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  processingExpiresAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
};

/** Mirrors SQL eligibility for whatsapp_webhook_events purge. */
export const isWebhookEventPurgeEligible = (
  input: WebhookRetentionInput,
  cutoff: Date,
  nowUtc: Date,
): boolean => {
  if (input.processingStatus === "RECEIVED" || input.processingStatus === "PROCESSING") {
    return false;
  }

  if (
    input.processingExpiresAt &&
    input.processingExpiresAt.getTime() > nowUtc.getTime()
  ) {
    return false;
  }

  const ageAnchor = input.processedAt ?? input.createdAt;
  if (ageAnchor.getTime() >= cutoff.getTime()) {
    return false;
  }

  if (input.processingStatus === "PROCESSED" || input.processingStatus === "ANOMALY") {
    return true;
  }

  if (input.processingStatus === "FAILED") {
    const exhausted = input.attemptCount >= input.maxAttempts;
    const retryDue =
      input.nextAttemptAt === null || input.nextAttemptAt.getTime() <= nowUtc.getTime();
    return exhausted && retryDue;
  }

  return false;
};

export type OutboxRetentionInput = {
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseExpiresAt: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

/** Mirrors SQL eligibility for lease-based notification outboxes. */
export const isLeaseOutboxPurgeEligible = (
  input: OutboxRetentionInput,
  cutoff: Date,
  nowUtc: Date,
): boolean => {
  if (isOutboxPendingStatus(input.status)) {
    return false;
  }

  if (!isOutboxTerminalStatus(input.status)) {
    return false;
  }

  if (input.leaseExpiresAt && input.leaseExpiresAt.getTime() > nowUtc.getTime()) {
    return false;
  }

  if (
    input.status === "FAILED" &&
    input.attemptCount < input.maxAttempts &&
    input.nextAttemptAt &&
    input.nextAttemptAt.getTime() > nowUtc.getTime()
  ) {
    return false;
  }

  const ageAnchor = input.sentAt ?? input.updatedAt ?? input.createdAt;
  return ageAnchor.getTime() < cutoff.getTime();
};

export type PayrollOutboxRetentionInput = {
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  leaseExpiresAt: Date | null;
  sentAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

export const isPayrollOutboxPurgeEligible = (
  input: PayrollOutboxRetentionInput,
  cutoff: Date,
  nowUtc: Date,
): boolean => {
  if (input.status === "PENDING" || input.status === "PROCESSING") {
    return false;
  }

  if (!isPayrollNotificationTerminalStatus(input.status)) {
    return false;
  }

  if (input.leaseExpiresAt && input.leaseExpiresAt.getTime() > nowUtc.getTime()) {
    return false;
  }

  if (
    input.status === "FAILED" &&
    input.attemptCount < input.maxAttempts &&
    input.nextAttemptAt &&
    input.nextAttemptAt.getTime() > nowUtc.getTime()
  ) {
    return false;
  }

  const ageAnchor = input.sentAt ?? input.updatedAt ?? input.createdAt;
  return ageAnchor.getTime() < cutoff.getTime();
};

export const isConversationPurgeEligible = (input: {
  status: string;
  lastActivityAt: Date;
  cutoff: Date;
}): boolean =>
  input.status !== WHATSAPP_CONVERSATION_ACTIVE_STATUS &&
  input.lastActivityAt.getTime() < input.cutoff.getTime();
