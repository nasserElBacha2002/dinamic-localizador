import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeRetentionCutoff } from "./whatsapp-retention-policy";
import {
  isAttendanceNotificationTerminalStatus,
  isBotSessionTerminalState,
  isConversationPurgeEligible,
  isLeaseOutboxPurgeEligible,
  isOutboxPendingStatus,
  isPayrollOutboxPurgeEligible,
  isWebhookEventPurgeEligible,
} from "./whatsapp-retention-policy";

describe("whatsapp-retention-policy", () => {
  it("computeRetentionCutoff uses UTC calendar days", () => {
    const now = new Date("2026-08-28T15:00:00.000Z");
    const cutoff = computeRetentionCutoff(now, 30);
    assert.equal(cutoff.toISOString(), "2026-07-29T15:00:00.000Z");
  });

  it("isBotSessionTerminalState recognizes terminal states only", () => {
    assert.equal(isBotSessionTerminalState("EXPIRED"), true);
    assert.equal(isBotSessionTerminalState("WAITING_LOCATION"), false);
  });

  it("isWebhookEventPurgeEligible keeps PROCESSING and retryable FAILED", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    const now = new Date("2026-08-28T00:00:00.000Z");

    assert.equal(
      isWebhookEventPurgeEligible(
        {
          processingStatus: "PROCESSING",
          attemptCount: 1,
          maxAttempts: 8,
          nextAttemptAt: null,
          processingExpiresAt: new Date("2026-08-29T00:00:00.000Z"),
          processedAt: null,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      false,
    );

    assert.equal(
      isWebhookEventPurgeEligible(
        {
          processingStatus: "FAILED",
          attemptCount: 2,
          maxAttempts: 8,
          nextAttemptAt: new Date("2026-09-01T00:00:00.000Z"),
          processingExpiresAt: null,
          processedAt: null,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      false,
    );

    assert.equal(
      isWebhookEventPurgeEligible(
        {
          processingStatus: "PROCESSED",
          attemptCount: 1,
          maxAttempts: 8,
          nextAttemptAt: null,
          processingExpiresAt: null,
          processedAt: new Date("2026-06-01T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      true,
    );
  });

  it("isLeaseOutboxPurgeEligible respects pending and active lease", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    const now = new Date("2026-08-28T00:00:00.000Z");

    assert.equal(isOutboxPendingStatus("PROCESSING"), true);
    assert.equal(
      isLeaseOutboxPurgeEligible(
        {
          status: "PROCESSING",
          attemptCount: 0,
          maxAttempts: 5,
          nextAttemptAt: null,
          leaseExpiresAt: null,
          sentAt: null,
          updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      false,
    );

    assert.equal(
      isLeaseOutboxPurgeEligible(
        {
          status: "SEND_ACCEPTED",
          attemptCount: 1,
          maxAttempts: 5,
          nextAttemptAt: null,
          leaseExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
          sentAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      false,
    );

    assert.equal(
      isLeaseOutboxPurgeEligible(
        {
          status: "SEND_ACCEPTED",
          attemptCount: 1,
          maxAttempts: 5,
          nextAttemptAt: null,
          leaseExpiresAt: null,
          sentAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      true,
    );
  });

  it("isPayrollOutboxPurgeEligible requires terminal payroll status", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    const now = new Date("2026-08-28T00:00:00.000Z");

    assert.equal(isAttendanceNotificationTerminalStatus("SUPERSEDED"), true);
    assert.equal(
      isPayrollOutboxPurgeEligible(
        {
          status: "SENT",
          attemptCount: 1,
          maxAttempts: 5,
          nextAttemptAt: null,
          leaseExpiresAt: null,
          sentAt: new Date("2026-06-01T00:00:00.000Z"),
          updatedAt: new Date("2026-06-01T00:00:00.000Z"),
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
        cutoff,
        now,
      ),
      true,
    );
  });

  it("isConversationPurgeEligible blocks ACTIVE conversations", () => {
    const cutoff = new Date("2026-07-01T00:00:00.000Z");
    assert.equal(
      isConversationPurgeEligible({
        status: "ACTIVE",
        lastActivityAt: new Date("2026-06-01T00:00:00.000Z"),
        cutoff,
      }),
      false,
    );
    assert.equal(
      isConversationPurgeEligible({
        status: "COMPLETED",
        lastActivityAt: new Date("2026-06-01T00:00:00.000Z"),
        cutoff,
      }),
      true,
    );
  });
});
