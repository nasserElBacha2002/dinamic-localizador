/**
 * Pure helpers for attendance-reminder run aggregation / outcome classification.
 * Keeps scoring logic out of the Twilio/send pipeline.
 */

export type ReminderSendOutcome =
  | "sent"
  | "failed"
  | "skipped"
  | "sent_context_failed"
  | "sent_persistence_unknown";

export type ReminderKindCounts = {
  ONE_TIME: number;
  RECURRING: number;
  OTHER: number;
};

export type ReminderOutcomeBucket = "sent" | "failed" | "skipped";

export const emptyReminderKindCounts = (): ReminderKindCounts => ({
  ONE_TIME: 0,
  RECURRING: 0,
  OTHER: 0,
});

export const mergeReminderKindCounts = (
  left: ReminderKindCounts,
  right: ReminderKindCounts,
): ReminderKindCounts => ({
  ONE_TIME: left.ONE_TIME + right.ONE_TIME,
  RECURRING: left.RECURRING + right.RECURRING,
  OTHER: left.OTHER + right.OTHER,
});

/** Classify send pipeline outcomes for counter aggregation (Twilio accepted counts as sent*). */
export const classifyReminderSendOutcome = (
  outcome: ReminderSendOutcome,
): ReminderOutcomeBucket => {
  if (
    outcome === "sent" ||
    outcome === "sent_context_failed" ||
    outcome === "sent_persistence_unknown"
  ) {
    return "sent";
  }
  if (outcome === "failed") {
    return "failed";
  }
  return "skipped";
};
