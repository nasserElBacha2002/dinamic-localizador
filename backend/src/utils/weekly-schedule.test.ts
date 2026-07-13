import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WEEKDAYS } from "../constants/weekday";
import type { WeeklyScheduleDay } from "../types/schedule";
import {
  isOvernightSchedule,
  normalizeWeeklyScheduleDays,
  validateWeeklyScheduleDays,
  weeklySchedulesEqual,
} from "./weekly-schedule";

function buildWeek(
  overrides: Partial<Record<(typeof WEEKDAYS)[number], Partial<WeeklyScheduleDay>>> = {},
): WeeklyScheduleDay[] {
  return WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY",
    startTime: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? "09:00" : null,
    endTime: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? "18:00" : null,
    ...overrides[dayOfWeek],
  }));
}

describe("weekly schedule utils", () => {
  it("normalizes disabled days to null times", () => {
    const normalized = normalizeWeeklyScheduleDays(
      buildWeek({
        SATURDAY: { isEnabled: true, startTime: "10:00", endTime: "12:00" },
      }),
    );

    const saturday = normalized.find((day) => day.dayOfWeek === "SATURDAY");
    assert.equal(saturday?.isEnabled, true);
    assert.equal(saturday?.startTime, "10:00");
  });

  it("rejects duplicate weekdays", () => {
    const days = buildWeek();
    days[1] = { ...days[0] };
    const result = validateWeeklyScheduleDays(days);
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "SCHEDULE_DUPLICATE_WEEKDAY");
    }
  });

  it("rejects enabled day without times", () => {
    const result = validateWeeklyScheduleDays(
      buildWeek({ MONDAY: { isEnabled: true, startTime: null, endTime: null } }),
    );
    assert.equal(result.valid, false);
  });

  it("allows overnight schedules", () => {
    const result = validateWeeklyScheduleDays(
      buildWeek({ MONDAY: { isEnabled: true, startTime: "22:00", endTime: "06:00" } }),
    );
    assert.equal(result.valid, true);
    assert.equal(isOvernightSchedule("22:00", "06:00"), true);
  });

  it("rejects start equal to end", () => {
    const result = validateWeeklyScheduleDays(
      buildWeek({ MONDAY: { isEnabled: true, startTime: "09:00", endTime: "09:00" } }),
    );
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "SCHEDULE_EQUAL_START_END");
    }
  });

  it("detects semantically identical schedules", () => {
    const left = buildWeek();
    const right = buildWeek();
    assert.equal(weeklySchedulesEqual(left, right), true);
  });
});
