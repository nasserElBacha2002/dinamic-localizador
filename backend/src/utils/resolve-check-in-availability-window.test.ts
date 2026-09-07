import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCheckInWindow,
  isWithinCheckInAvailabilityWindow,
  resolveCheckInCandidateRange,
} from "./resolve-check-in-availability-window";
import { buildRecurringExpectedInstants } from "./recurring-workday-instant";

describe("evaluateCheckInWindow policy", () => {
  const schedule = {
    expectedStartAt: "2026-07-31T12:00:00.000Z",
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 15,
  };

  const cases: Array<{
    at: string;
    available: boolean;
    punctuality: "EARLY" | "ON_TIME" | "LATE" | null;
    reason?: "BEFORE_CHECK_IN_WINDOW" | "AFTER_CHECK_IN_WINDOW";
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
    { at: "2026-07-31T12:15:00.000Z", available: true, punctuality: "LATE" },
    {
      at: "2026-07-31T12:15:00.001Z",
      available: false,
      punctuality: null,
      reason: "AFTER_CHECK_IN_WINDOW",
    },
    {
      at: "2026-07-31T20:00:00.000Z",
      available: false,
      punctuality: null,
      reason: "AFTER_CHECK_IN_WINDOW",
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

  it("rejects after start+lateTolerance", () => {
    const evaluation = evaluateCheckInWindow(
      {
        expectedStartAt: "2026-07-31T12:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
      },
      new Date("2026-07-31T12:20:00.000Z"),
    );
    assert.equal(evaluation.available, false);
    assert.equal(evaluation.rejectionReason, "AFTER_CHECK_IN_WINDOW");
  });

  it("supports zero tolerances", () => {
    const zeroSchedule = {
      expectedStartAt: "2026-07-31T12:00:00.000Z",
      earlyToleranceMinutes: 0,
      lateToleranceMinutes: 0,
    };
    assert.equal(
      evaluateCheckInWindow(zeroSchedule, new Date("2026-07-31T12:00:00.000Z")).available,
      true,
    );
    assert.equal(
      evaluateCheckInWindow(zeroSchedule, new Date("2026-07-31T12:01:00.000Z")).available,
      false,
    );
  });

  it("handles an arrival window that crosses UTC midnight", () => {
    const overnightSchedule = {
      expectedStartAt: "2026-08-01T00:10:00.000Z",
      earlyToleranceMinutes: 20,
      lateToleranceMinutes: 15,
    };
    assert.equal(
      evaluateCheckInWindow(
        overnightSchedule,
        new Date("2026-07-31T23:50:00.000Z"),
      ).punctuality,
      "EARLY",
    );
    assert.equal(
      evaluateCheckInWindow(
        overnightSchedule,
        new Date("2026-08-01T00:25:00.000Z"),
      ).punctuality,
      "LATE",
    );
  });

  it("applies the same tolerance to company-timezone instants", () => {
    const { expectedStartAt } = buildRecurringExpectedInstants({
      workDate: "2026-07-31",
      startTime: "20:30",
      endTime: "03:00",
      timezone: "America/Argentina/Buenos_Aires",
    });
    const scheduleInCompanyTimezone = {
      expectedStartAt,
      earlyToleranceMinutes: 30,
      lateToleranceMinutes: 15,
    };

    assert.equal(
      evaluateCheckInWindow(
        scheduleInCompanyTimezone,
        new Date(expectedStartAt.getTime() - 30 * 60_000),
      ).available,
      true,
    );
    assert.equal(
      evaluateCheckInWindow(
        scheduleInCompanyTimezone,
        new Date(expectedStartAt.getTime() + 16 * 60_000),
      ).available,
      false,
    );
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
