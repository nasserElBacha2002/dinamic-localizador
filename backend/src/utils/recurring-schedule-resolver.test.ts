import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WEEKDAYS } from "../constants/weekday";
import type { WeeklyScheduleDay } from "../types/schedule";
import {
  recurringScheduleResolver,
  resolveIsoWeekdayFromDateIso,
} from "./recurring-schedule-resolver";

const companyDays: WeeklyScheduleDay[] = WEEKDAYS.map((dayOfWeek) => ({
  dayOfWeek,
  isEnabled: dayOfWeek === "MONDAY",
  startTime: dayOfWeek === "MONDAY" ? "22:00" : null,
  endTime: dayOfWeek === "MONDAY" ? "06:00" : null,
}));

describe("recurring schedule resolver", () => {
  it("maps ISO date to weekday without timezone drift", () => {
    assert.equal(resolveIsoWeekdayFromDateIso("2026-08-03"), 1);
    assert.equal(resolveIsoWeekdayFromDateIso("2026-08-09"), 7);
  });

  it("resolves enabled custom day with overnight hours", () => {
    const resolved = recurringScheduleResolver.resolveDay("2026-08-03", {
      scheduleSource: "CUSTOM",
      timezone: "America/Argentina/Buenos_Aires",
      version: 2,
      days: companyDays,
    });

    assert.equal(resolved.dayOfWeek, "MONDAY");
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.startTime, "22:00");
    assert.equal(resolved.endTime, "06:00");
    assert.equal(resolved.scheduleSource, "CUSTOM");
    assert.equal(resolved.scheduleVersion, 2);
    assert.equal(resolved.timezone, "America/Argentina/Buenos_Aires");
  });

  it("resolves disabled weekday", () => {
    const resolved = recurringScheduleResolver.resolveDay("2026-08-04", {
      scheduleSource: "COMPANY",
      timezone: "America/Argentina/Buenos_Aires",
      version: 1,
      days: companyDays,
    });

    assert.equal(resolved.dayOfWeek, "TUESDAY");
    assert.equal(resolved.enabled, false);
    assert.equal(resolved.startTime, null);
    assert.equal(resolved.endTime, null);
    assert.equal(resolved.scheduleSource, "COMPANY");
  });
});
