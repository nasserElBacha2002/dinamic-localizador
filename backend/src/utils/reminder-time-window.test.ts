import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ATTENDANCE_REMINDER_LEAD_MINUTES } from "../constants/attendance-notification";
import { buildReminderTargetWindow } from "./reminder-time-window";

describe("buildReminderTargetWindow", () => {
  it("builds a one-minute target window 15 minutes ahead", () => {
    const referenceAt = new Date("2026-06-23T13:00:00.000Z");
    const window = buildReminderTargetWindow(referenceAt, ATTENDANCE_REMINDER_LEAD_MINUTES);

    assert.equal(window.referenceAt.toISOString(), referenceAt.toISOString());
    assert.equal(window.windowStart.toISOString(), "2026-06-23T13:15:00.000Z");
    assert.equal(window.windowEnd.toISOString(), "2026-06-23T13:16:00.000Z");
  });
});
