import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToDateIso,
  buildRecurringExpectedInstants,
  buildUtcInstantFromLocalWorkDateTime,
} from "./recurring-workday-instant";
import { computeMaterializationRange, iterateDateIsoRange } from "./recurring-workday-range";

describe("recurring-workday-instant", () => {
  it("builds daytime expected instants in Buenos Aires", () => {
    const { expectedStartAt, expectedEndAt } = buildRecurringExpectedInstants({
      workDate: "2026-08-03",
      startTime: "09:00",
      endTime: "18:00",
      timezone: "America/Argentina/Buenos_Aires",
    });

    assert.equal(expectedStartAt.toISOString(), "2026-08-03T12:00:00.000Z");
    assert.equal(expectedEndAt.toISOString(), "2026-08-03T21:00:00.000Z");
  });

  it("keeps workDate on overnight start day", () => {
    const { expectedStartAt, expectedEndAt } = buildRecurringExpectedInstants({
      workDate: "2026-08-03",
      startTime: "22:00",
      endTime: "06:00",
      timezone: "America/Argentina/Buenos_Aires",
    });

    assert.equal(expectedStartAt.toISOString(), "2026-08-04T01:00:00.000Z");
    assert.equal(expectedEndAt.toISOString(), "2026-08-04T09:00:00.000Z");
  });

  it("adds days to iso date", () => {
    assert.equal(addDaysToDateIso("2026-08-01", 60), "2026-09-30");
  });
});

describe("recurring-workday-range", () => {
  it("starts at max(localToday, validFrom)", () => {
    const range = computeMaterializationRange({
      timezone: "America/Argentina/Buenos_Aires",
      validFrom: "2026-08-01",
      validUntil: null,
      horizonDays: 60,
      referenceAt: new Date("2026-08-10T15:00:00.000Z"),
    });

    assert.deepEqual(range, { rangeStart: "2026-08-10", rangeEnd: "2026-10-09" });
  });

  it("does not backfill before local today", () => {
    const range = computeMaterializationRange({
      timezone: "America/Argentina/Buenos_Aires",
      validFrom: "2026-01-01",
      validUntil: null,
      horizonDays: 30,
      referenceAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    assert.equal(range?.rangeStart, "2026-08-01");
  });

  it("iterates inclusive date range", () => {
    assert.deepEqual([...iterateDateIsoRange("2026-08-01", "2026-08-03")], [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });
});

describe("buildUtcInstantFromLocalWorkDateTime", () => {
  it("uses timezone offset helper without Z concatenation", () => {
    const instant = buildUtcInstantFromLocalWorkDateTime(
      "2026-08-03",
      "09:00",
      "America/Argentina/Buenos_Aires",
    );
    assert.equal(instant.toISOString(), "2026-08-03T12:00:00.000Z");
  });
});
