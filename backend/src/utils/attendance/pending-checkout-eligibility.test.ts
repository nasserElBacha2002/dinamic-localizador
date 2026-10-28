import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPendingCheckoutEligible,
  resolveCheckoutEligibilityEndAt,
  resolvePendingCheckoutExpirationAt,
} from "./pending-checkout-eligibility";

describe("isPendingCheckoutEligible", () => {
  const expectedEndAt = new Date("2026-07-07T03:00:00.000Z");

  it("Scenario A: still eligible 5 hours after end with 12h window", () => {
    const now = new Date("2026-07-07T08:00:00.000Z");
    assert.equal(
      isPendingCheckoutEligible({ expectedEndAt, expirationHours: 12, now }),
      true,
    );
  });

  it("Scenario B: expired 13 hours after end with 12h window", () => {
    const now = new Date("2026-07-07T16:00:00.000Z");
    assert.equal(
      isPendingCheckoutEligible({ expectedEndAt, expirationHours: 12, now }),
      false,
    );
  });

  it("Scenario C: custom 24h window keeps 13h-old end eligible", () => {
    const now = new Date("2026-07-07T16:00:00.000Z");
    assert.equal(
      isPendingCheckoutEligible({ expectedEndAt, expirationHours: 24, now }),
      true,
    );
  });

  it("Scenario G: exact boundary remains eligible; one ms later expires", () => {
    const expirationAt = resolvePendingCheckoutExpirationAt(expectedEndAt, 12);
    assert.equal(expirationAt.toISOString(), "2026-07-07T15:00:00.000Z");
    assert.equal(
      isPendingCheckoutEligible({
        expectedEndAt,
        expirationHours: 12,
        now: expirationAt,
      }),
      true,
    );
    assert.equal(
      isPendingCheckoutEligible({
        expectedEndAt,
        expirationHours: 12,
        now: new Date(expirationAt.getTime() + 1),
      }),
      false,
    );
  });

  it("Scenario overnight: expiration is based on expected_end_at instant", () => {
    // Local overnight op ending Tuesday 03:00 Argentina ≈ 06:00 UTC (no DST in 2026 winter)
    const overnightEnd = new Date("2026-07-07T06:00:00.000Z");
    const atBoundary = new Date("2026-07-07T18:00:00.000Z");
    assert.equal(
      isPendingCheckoutEligible({
        expectedEndAt: overnightEnd,
        expirationHours: 12,
        now: atBoundary,
      }),
      true,
    );
    assert.equal(
      isPendingCheckoutEligible({
        expectedEndAt: overnightEnd,
        expirationHours: 12,
        now: new Date(atBoundary.getTime() + 1),
      }),
      false,
    );
  });

  it("rejects invalid expiration hours", () => {
    assert.equal(
      isPendingCheckoutEligible({
        expectedEndAt,
        expirationHours: 0,
        now: expectedEndAt,
      }),
      false,
    );
  });
});

describe("resolveCheckoutEligibilityEndAt", () => {
  it("falls back to expectedStartAt when expectedEndAt is null", () => {
    assert.equal(
      resolveCheckoutEligibilityEndAt({
        expectedEndAt: null,
        expectedStartAt: "2026-07-07T20:30:00.000Z",
      }),
      "2026-07-07T20:30:00.000Z",
    );
  });
});
