import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBeginAttemptAllowed,
  isFirstAttemptClaimable,
  isNotificationRetryable,
} from "./attendance-notification-retry";

describe("isNotificationRetryable", () => {
  const now = new Date("2026-06-23T13:00:00.000Z");
  const staleBefore = new Date("2026-06-23T12:54:00.000Z");

  it("never retries SENT_RECOVERY_REQUIRED notifications", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "SENT_RECOVERY_REQUIRED",
          attemptCount: 1,
          lastAttemptAt: "2026-06-23T12:50:00.000Z",
          createdAt: "2026-06-23T12:50:00.000Z",
        },
        staleBefore,
        3,
      ),
      false,
    );
  });

  it("never retries SENT notifications", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "SENT",
          attemptCount: 1,
          lastAttemptAt: "2026-06-23T12:50:00.000Z",
          createdAt: "2026-06-23T12:50:00.000Z",
        },
        staleBefore,
        3,
      ),
      false,
    );
  });

  it("retries FAILED notifications below the max attempt count", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "FAILED",
          attemptCount: 2,
          lastAttemptAt: "2026-06-23T12:58:00.000Z",
          createdAt: "2026-06-23T12:50:00.000Z",
        },
        staleBefore,
        3,
      ),
      true,
    );
  });

  it("does not retry FAILED notifications at the max attempt count", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "FAILED",
          attemptCount: 3,
          lastAttemptAt: "2026-06-23T12:58:00.000Z",
          createdAt: "2026-06-23T12:50:00.000Z",
        },
        staleBefore,
        3,
      ),
      false,
    );
  });

  it("retries stale PENDING notifications", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "PENDING",
          attemptCount: 1,
          lastAttemptAt: "2026-06-23T12:50:00.000Z",
          createdAt: "2026-06-23T12:49:00.000Z",
        },
        now,
        3,
      ),
      true,
    );
  });

  it("does not retry fresh PENDING notifications", () => {
    assert.equal(
      isNotificationRetryable(
        {
          status: "PENDING",
          attemptCount: 1,
          lastAttemptAt: "2026-06-23T12:58:00.000Z",
          createdAt: "2026-06-23T12:49:00.000Z",
        },
        staleBefore,
        3,
      ),
      false,
    );
  });
});

describe("isFirstAttemptClaimable", () => {
  it("allows only untouched PENDING rows", () => {
    assert.equal(
      isFirstAttemptClaimable({
        status: "PENDING",
        attemptCount: 0,
        lastAttemptAt: null,
      }),
      true,
    );
    assert.equal(
      isFirstAttemptClaimable({
        status: "PENDING",
        attemptCount: 1,
        lastAttemptAt: "2026-06-23T12:58:00.000Z",
      }),
      false,
    );
    assert.equal(
      isFirstAttemptClaimable({
        status: "SENT",
        attemptCount: 1,
        lastAttemptAt: "2026-06-23T12:58:00.000Z",
      }),
      false,
    );
  });
});

describe("isBeginAttemptAllowed", () => {
  it("rejects SENT notifications", () => {
    assert.equal(
      isBeginAttemptAllowed(
        {
          status: "SENT",
          attemptCount: 1,
        },
        3,
      ),
      false,
    );
  });

  it("rejects notifications at max attempts", () => {
    assert.equal(
      isBeginAttemptAllowed(
        {
          status: "PENDING",
          attemptCount: 3,
        },
        3,
      ),
      false,
    );
    assert.equal(
      isBeginAttemptAllowed(
        {
          status: "FAILED",
          attemptCount: 3,
        },
        3,
      ),
      false,
    );
  });

  it("allows PENDING notifications below max attempts", () => {
    assert.equal(
      isBeginAttemptAllowed(
        {
          status: "PENDING",
          attemptCount: 1,
        },
        3,
      ),
      true,
    );
  });
});
