import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WEEKDAYS, type WeeklyScheduleDay } from "../types/schedule";
import { extractUniformWeeklyScheduleTimes } from "./uniform-weekly-schedule-times";

function day(
  dayOfWeek: WeeklyScheduleDay["dayOfWeek"],
  isEnabled: boolean,
  startTime: string | null,
  endTime: string | null,
): WeeklyScheduleDay {
  return { dayOfWeek, isEnabled, startTime, endTime };
}

const weekdayUniform = WEEKDAYS.map((dayOfWeek) =>
  day(
    dayOfWeek,
    dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY",
    dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? "20:30" : null,
    dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? "03:00" : null,
  ),
);

describe("extractUniformWeeklyScheduleTimes", () => {
  it("returns overnight pair when all enabled days match", () => {
    assert.deepEqual(extractUniformWeeklyScheduleTimes(weekdayUniform), {
      startTime: "20:30",
      endTime: "03:00",
    });
  });

  it("ignores disabled days when detecting uniformity", () => {
    const days = weekdayUniform.map((entry) =>
      entry.dayOfWeek === "SATURDAY"
        ? { ...entry, isEnabled: false, startTime: "09:00", endTime: "12:00" }
        : entry,
    );

    assert.deepEqual(extractUniformWeeklyScheduleTimes(days), {
      startTime: "20:30",
      endTime: "03:00",
    });
  });

  it("returns null when enabled days have different hours", () => {
    const days = weekdayUniform.map((entry) =>
      entry.dayOfWeek === "FRIDAY"
        ? { ...entry, startTime: "21:00", endTime: "04:00" }
        : entry,
    );

    assert.equal(extractUniformWeeklyScheduleTimes(days), null);
  });

  it("returns null when an enabled day has no hours", () => {
    const days = weekdayUniform.map((entry) =>
      entry.dayOfWeek === "MONDAY"
        ? { ...entry, startTime: null, endTime: null }
        : entry,
    );

    assert.equal(extractUniformWeeklyScheduleTimes(days), null);
  });

  it("returns null when an enabled day has only start time", () => {
    const days = weekdayUniform.map((entry) =>
      entry.dayOfWeek === "TUESDAY" ? { ...entry, endTime: null } : entry,
    );

    assert.equal(extractUniformWeeklyScheduleTimes(days), null);
  });

  it("returns null when an enabled day has only end time", () => {
    const days = weekdayUniform.map((entry) =>
      entry.dayOfWeek === "WEDNESDAY" ? { ...entry, startTime: null } : entry,
    );

    assert.equal(extractUniformWeeklyScheduleTimes(days), null);
  });

  it("returns null when no enabled day has complete hours", () => {
    const days = WEEKDAYS.map((dayOfWeek) => day(dayOfWeek, false, null, null));
    assert.equal(extractUniformWeeklyScheduleTimes(days), null);
  });
});
