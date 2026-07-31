import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCheckInWindow,
  isWithinCheckInAvailabilityWindow,
  resolveCheckInCandidateRange,
} from "./resolve-check-in-availability-window";

describe("evaluateCheckInWindow policy", () => {
  const schedule = {
    expectedStartAt: "2026-07-31T12:00:00.000Z",
    expectedEndAt: "2026-07-31T20:00:00.000Z",
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 15,
  };

  const cases: Array<{
    at: string;
    available: boolean;
    punctuality: "EARLY" | "ON_TIME" | "LATE" | null;
    reason?: "BEFORE_CHECK_IN_WINDOW" | "AFTER_EXPECTED_END";
  }> = [
    {
      at: "2026-07-31T11:44:59.999Z",
      available: false,
      punctuality: null,
      reason: "BEFORE_CHECK_IN_WINDOW",
    },
    { at: "2026-07-31T11:45:00.000Z", available: true, punctuality: "EARLY" },
    { at: "2026-07-31T11:59:59.999Z", available: true, punctuality: "EARLY" },
    { at: "2026-07-31T12:00:00.000Z", available: true, punctuality: "ON_TIME" },
    { at: "2026-07-31T12:15:00.000Z", available: true, punctuality: "ON_TIME" },
    { at: "2026-07-31T12:15:00.001Z", available: true, punctuality: "LATE" },
    { at: "2026-07-31T14:41:51.000Z", available: true, punctuality: "LATE" },
    { at: "2026-07-31T19:59:59.999Z", available: true, punctuality: "LATE" },
    {
      at: "2026-07-31T20:00:00.000Z",
      available: false,
      punctuality: null,
      reason: "AFTER_EXPECTED_END",
    },
    {
      at: "2026-07-31T20:00:00.001Z",
      available: false,
      punctuality: null,
      reason: "AFTER_EXPECTED_END",
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.at} → available=${testCase.available} punctuality=${testCase.punctuality}`, () => {
      const evaluation = evaluateCheckInWindow(schedule, new Date(testCase.at));
      assert.equal(evaluation.available, testCase.available);
      assert.equal(evaluation.punctuality, testCase.punctuality);
      assert.equal(evaluation.rejectionReason, testCase.reason);
      assert.equal(isWithinCheckInAvailabilityWindow(schedule, new Date(testCase.at)), testCase.available);
    });
  }

  it("falls back to start+lateTolerance when expectedEndAt is missing", () => {
    const evaluation = evaluateCheckInWindow(
      {
        expectedStartAt: "2026-07-31T12:00:00.000Z",
        expectedEndAt: null,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
      },
      new Date("2026-07-31T12:20:00.000Z"),
    );
    assert.equal(evaluation.available, false);
    assert.equal(evaluation.rejectionReason, "AFTER_EXPECTED_END");
  });
});

describe("resolveCheckInCandidateRange", () => {
  it("builds a bounded candidate range around the current instant", () => {
    const at = new Date("2026-07-07T12:00:00.000Z");
    const range = resolveCheckInCandidateRange(at, { lookbackHours: 1, lookaheadHours: 2 });
    assert.equal(range.candidateFrom.toISOString(), "2026-07-07T11:00:00.000Z");
    assert.equal(range.candidateTo.toISOString(), "2026-07-07T14:00:00.000Z");
  });
});
