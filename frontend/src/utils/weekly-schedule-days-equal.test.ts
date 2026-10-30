import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultWeeklySchedule, type WeeklyScheduleDay } from "../types/schedule";
import { weeklyScheduleDaysEqual } from "./weekly-schedule-days-equal";

describe("weeklyScheduleDaysEqual", () => {
  it("returns false when arrays have different lengths", () => {
    const full = createDefaultWeeklySchedule();
    const shorter = full.slice(0, 3);

    assert.equal(weeklyScheduleDaysEqual(full, shorter), false);
    assert.equal(weeklyScheduleDaysEqual(shorter, full), false);
  });

  it("does not throw when a weekday is missing on the other side", () => {
    const left: WeeklyScheduleDay[] = [
      {
        dayOfWeek: "MONDAY",
        isEnabled: true,
        startTime: "09:00",
        endTime: "18:00",
      },
    ];
    const right: WeeklyScheduleDay[] = [
      {
        dayOfWeek: "TUESDAY",
        isEnabled: true,
        startTime: "09:00",
        endTime: "18:00",
      },
    ];

    assert.equal(weeklyScheduleDaysEqual(left, right), false);
  });

  it("compares schedules by dayOfWeek regardless of order", () => {
    const baseline = createDefaultWeeklySchedule();
    const reordered = [...baseline].reverse();

    assert.equal(weeklyScheduleDaysEqual(baseline, reordered), true);
  });
});
