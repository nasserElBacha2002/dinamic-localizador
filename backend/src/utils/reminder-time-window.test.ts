import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ATTENDANCE_REMINDER_LEAD_MINUTES } from "../constants/attendance-notification";
import { buildReminderDueWindow } from "./reminder-time-window";

describe("buildReminderDueWindow", () => {
  it("builds a due window from now through the next 15 minutes", () => {
    const referenceAt = new Date("2026-06-23T13:00:00.000Z");
    const window = buildReminderDueWindow(referenceAt, ATTENDANCE_REMINDER_LEAD_MINUTES);

    assert.equal(window.referenceAt.toISOString(), referenceAt.toISOString());
    assert.equal(window.windowStart.toISOString(), "2026-06-23T13:00:00.000Z");
    assert.equal(window.windowEnd.toISOString(), "2026-06-23T13:15:00.000Z");
  });

  it("includes inventories starting in 10 minutes when the job runs late", () => {
    const referenceAt = new Date("2026-06-23T13:05:00.000Z");
    const inventoryStart = new Date("2026-06-23T13:15:00.000Z");
    const window = buildReminderDueWindow(referenceAt, ATTENDANCE_REMINDER_LEAD_MINUTES);

    assert.equal(inventoryStart >= window.windowStart, true);
    assert.equal(inventoryStart <= window.windowEnd, true);
  });
});
