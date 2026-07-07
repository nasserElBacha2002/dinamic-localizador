import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWithinCheckInAvailabilityWindow,
  resolveCheckInCandidateRange,
} from "./resolve-check-in-availability-window";

describe("resolveCheckInAvailabilityWindow", () => {
  const schedule = {
    expectedStartAt: "2026-07-07T12:00:00.000Z",
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 20,
  };

  it("accepts check-in inside the late tolerance window", () => {
    const at = new Date("2026-07-07T12:19:00.000Z");
    assert.equal(isWithinCheckInAvailabilityWindow(schedule, at), true);
  });

  it("rejects check-in after the late tolerance window", () => {
    const at = new Date("2026-07-07T12:21:00.000Z");
    assert.equal(isWithinCheckInAvailabilityWindow(schedule, at), false);
  });

  it("builds a bounded candidate range around the current instant", () => {
    const at = new Date("2026-07-07T12:00:00.000Z");
    const range = resolveCheckInCandidateRange(at, { lookbackHours: 1, lookaheadHours: 2 });
    assert.equal(range.candidateFrom.toISOString(), "2026-07-07T11:00:00.000Z");
    assert.equal(range.candidateTo.toISOString(), "2026-07-07T14:00:00.000Z");
  });
});
