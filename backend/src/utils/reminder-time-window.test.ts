import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTENDANCE_REMINDER_LEAD_MINUTES,
  NO_CHECKIN_AT_START_WINDOW_MINUTES,
} from "../constants/attendance-notification";
import { buildInventoryStartDueWindow, buildReminderDueWindow } from "./reminder-time-window";

describe("buildReminderDueWindow", () => {
  it("builds a due window from now through the next 15 minutes", () => {
    const referenceAt = new Date("2026-06-23T14:00:00.000Z");
    const window = buildReminderDueWindow(referenceAt, ATTENDANCE_REMINDER_LEAD_MINUTES);

    assert.equal(window.referenceAt.toISOString(), referenceAt.toISOString());
    assert.equal(window.windowStart.toISOString(), referenceAt.toISOString());
    assert.equal(
      window.windowEnd.toISOString(),
      new Date(referenceAt.getTime() + ATTENDANCE_REMINDER_LEAD_MINUTES * 60_000).toISOString(),
    );
  });

  it("allows a late worker tick to still catch inventories near the window edge", () => {
    const referenceAt = new Date("2026-06-23T14:00:00.000Z");
    const window = buildReminderDueWindow(referenceAt, ATTENDANCE_REMINDER_LEAD_MINUTES);
    const inventoryStart = new Date(referenceAt.getTime() + 14 * 60_000 + 30_000);

    assert.ok(inventoryStart >= window.windowStart);
    assert.ok(inventoryStart <= window.windowEnd);
  });
});

describe("buildInventoryStartDueWindow", () => {
  it("builds a backward-looking window ending at referenceAt", () => {
    const referenceAt = new Date("2026-06-23T14:00:00.000Z");
    const window = buildInventoryStartDueWindow(referenceAt, NO_CHECKIN_AT_START_WINDOW_MINUTES);

    assert.equal(window.referenceAt.toISOString(), referenceAt.toISOString());
    assert.equal(
      window.windowStart.toISOString(),
      new Date(referenceAt.getTime() - 60_000).toISOString(),
    );
    assert.equal(window.windowEnd.toISOString(), referenceAt.toISOString());
  });

  it("does not include inventories scheduled in the future", () => {
    const referenceAt = new Date("2026-06-23T14:00:00.000Z");
    const window = buildInventoryStartDueWindow(referenceAt, NO_CHECKIN_AT_START_WINDOW_MINUTES);
    const futureInventoryStart = new Date(referenceAt.getTime() + 30_000);

    assert.ok(futureInventoryStart > window.windowEnd);
    assert.ok(futureInventoryStart > window.referenceAt);
  });
});
