import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectOneTimeScheduleAffectingChanges } from "../utils/one-time-schedule-change";

describe("detectOneTimeScheduleAffectingChanges", () => {
  const base = {
    scheduledStart: "2026-07-16T23:30:00.000Z",
    scheduledEnd: "2026-07-17T06:00:00.000Z",
    earlyToleranceMinutes: 60,
    lateToleranceMinutes: 90,
  };

  it("ignores notes-only style empty inputs", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {});
    assert.equal(flags.scheduleAffecting, false);
    assert.equal(flags.timingChanged, false);
    assert.equal(flags.toleranceChanged, false);
  });

  it("detects scheduled start/end changes", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      scheduledStart: "2026-07-27T23:30:00.000Z",
      scheduledEnd: "2026-07-28T06:00:00.000Z",
    });
    assert.equal(flags.timingChanged, true);
    assert.equal(flags.scheduleAffecting, true);
  });

  it("detects tolerance-only changes", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      earlyToleranceMinutes: 45,
    });
    assert.equal(flags.toleranceChanged, true);
    assert.equal(flags.timingChanged, false);
    assert.equal(flags.scheduleAffecting, true);
  });

  it("treats identical timestamps as no timing change", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      scheduledStart: "2026-07-16T23:30:00.000Z",
      scheduledEnd: "2026-07-17T06:00:00.000Z",
    });
    assert.equal(flags.timingChanged, false);
    assert.equal(flags.scheduleAffecting, false);
  });
});
