import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectOneTimeScheduleAffectingChanges,
  resolveNextWorkdayScheduleVersion,
} from "../utils/one-time-schedule-change";

describe("detectOneTimeScheduleAffectingChanges", () => {
  const base = {
    scheduledStart: "2026-07-16T23:30:00.000Z",
    scheduledEnd: "2026-07-17T06:00:00.000Z",
    earlyToleranceMinutes: 60,
    lateToleranceMinutes: 90,
  };

  it("ignores empty update inputs", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {});
    assert.equal(flags.scheduleAffecting, false);
    assert.equal(flags.timingChanged, false);
    assert.equal(flags.toleranceChanged, false);
    assert.equal(flags.reminderScheduleChanged, false);
    assert.equal(flags.confirmationScheduleChanged, false);
  });

  it("marks timing change as reminder and confirmation schedule change", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      scheduledStart: "2026-07-27T23:30:00.000Z",
      scheduledEnd: "2026-07-28T06:00:00.000Z",
    });
    assert.equal(flags.timingChanged, true);
    assert.equal(flags.workdaySnapshotChanged, true);
    assert.equal(flags.reminderScheduleChanged, true);
    assert.equal(flags.confirmationScheduleChanged, true);
    assert.equal(flags.scheduleAffecting, true);
  });

  it("tolerance-only changes snapshot without bumping reminder schedule", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      earlyToleranceMinutes: 45,
    });
    assert.equal(flags.toleranceChanged, true);
    assert.equal(flags.timingChanged, false);
    assert.equal(flags.workdaySnapshotChanged, true);
    assert.equal(flags.reminderScheduleChanged, false);
    assert.equal(flags.confirmationScheduleChanged, false);
    assert.equal(flags.scheduleAffecting, true);
  });

  it("keeps schedule version stable on tolerance-only", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      lateToleranceMinutes: 120,
    });
    assert.equal(resolveNextWorkdayScheduleVersion(3, flags), 3);
  });

  it("bumps schedule version only when reminder schedule changes", () => {
    const flags = detectOneTimeScheduleAffectingChanges(base, {
      scheduledStart: "2026-07-27T23:30:00.000Z",
    });
    assert.equal(resolveNextWorkdayScheduleVersion(3, flags), 4);
  });
});
