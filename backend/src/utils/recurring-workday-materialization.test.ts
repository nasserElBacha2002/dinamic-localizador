import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
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
    assert.equal(addDaysToDateIso("2026-08-01", 59), "2026-09-29");
  });
});

describe("recurring-workday-range horizon semantics", () => {
  const timezone = "America/Argentina/Buenos_Aires";
  const referenceAt = new Date("2026-08-10T15:00:00.000Z");

  it("horizonDays=1 materializes today only", () => {
    const range = computeMaterializationRange({
      timezone,
      validFrom: "2026-01-01",
      validUntil: null,
      horizonDays: 1,
      referenceAt,
    });

    assert.deepEqual(range, { rangeStart: "2026-08-10", rangeEnd: "2026-08-10" });
    assert.deepEqual([...iterateDateIsoRange(range!.rangeStart, range!.rangeEnd)], ["2026-08-10"]);
  });

  it("horizonDays=2 materializes today and tomorrow", () => {
    const range = computeMaterializationRange({
      timezone,
      validFrom: "2026-01-01",
      validUntil: null,
      horizonDays: 2,
      referenceAt,
    });

    assert.deepEqual(range, { rangeStart: "2026-08-10", rangeEnd: "2026-08-11" });
  });

  it("horizonDays=60 materializes exactly 60 inclusive dates", () => {
    const range = computeMaterializationRange({
      timezone,
      validFrom: "2026-01-01",
      validUntil: null,
      horizonDays: 60,
      referenceAt,
    });

    assert.deepEqual(range, { rangeStart: "2026-08-10", rangeEnd: "2026-10-08" });
    assert.equal([...iterateDateIsoRange(range!.rangeStart, range!.rangeEnd)].length, 60);
  });

  it("truncates range by validUntil", () => {
    const range = computeMaterializationRange({
      timezone,
      validFrom: "2026-08-01",
      validUntil: "2026-08-12",
      horizonDays: 60,
      referenceAt,
    });

    assert.equal(range?.rangeEnd, "2026-08-12");
  });

  it("does not backfill before local today", () => {
    const range = computeMaterializationRange({
      timezone,
      validFrom: "2026-01-01",
      validUntil: null,
      horizonDays: 30,
      referenceAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    assert.equal(range?.rangeStart, "2026-08-01");
  });
});

describe("buildUtcInstantFromLocalWorkDateTime DST semantics", () => {
  const ny = "America/New_York";

  it("resolves normal local time before spring DST transition", () => {
    const instant = buildUtcInstantFromLocalWorkDateTime("2024-03-09", "09:00", ny);
    assert.equal(instant.toISOString(), "2024-03-09T14:00:00.000Z");
  });

  it("resolves normal local time after spring DST transition", () => {
    const instant = buildUtcInstantFromLocalWorkDateTime("2024-03-11", "09:00", ny);
    assert.equal(instant.toISOString(), "2024-03-11T13:00:00.000Z");
  });

  it("rejects nonexistent local time during spring forward gap", () => {
    assert.throws(
      () => buildUtcInstantFromLocalWorkDateTime("2024-03-10", "02:30", ny),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_LOCAL_SCHEDULE_TIME",
    );
  });

  it("rejects ambiguous local time during fall back overlap", () => {
    assert.throws(
      () => buildUtcInstantFromLocalWorkDateTime("2024-11-03", "01:30", ny),
      (error: unknown) => error instanceof AppError && error.code === "AMBIGUOUS_LOCAL_SCHEDULE_TIME",
    );
  });

  it("resolves overnight start and end independently across DST", () => {
    const { expectedStartAt, expectedEndAt } = buildRecurringExpectedInstants({
      workDate: "2024-03-09",
      startTime: "22:00",
      endTime: "06:00",
      timezone: ny,
    });

    assert.equal(expectedStartAt.toISOString(), "2024-03-10T03:00:00.000Z");
    assert.equal(expectedEndAt.toISOString(), "2024-03-10T10:00:00.000Z");
  });

  it("Buenos Aires regression remains stable", () => {
    const instant = buildUtcInstantFromLocalWorkDateTime(
      "2026-08-03",
      "09:00",
      "America/Argentina/Buenos_Aires",
    );
    assert.equal(instant.toISOString(), "2026-08-03T12:00:00.000Z");
  });
});
