import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWorkDateFromScheduledStart } from "./work-date";

const timezone = "America/Argentina/Buenos_Aires";

describe("resolveWorkDateFromScheduledStart", () => {
  it("uses local calendar date for a standard daytime operation", () => {
    const workDate = resolveWorkDateFromScheduledStart(
      "2026-07-06T15:00:00.000Z",
      timezone,
    );
    assert.equal(workDate, "2026-07-06");
  });

  it("belongs to the local start day when the operation crosses midnight", () => {
    // 2026-07-07 01:00 UTC = 2026-07-06 22:00 in Buenos Aires
    const workDate = resolveWorkDateFromScheduledStart(
      "2026-07-07T01:00:00.000Z",
      timezone,
    );
    assert.equal(workDate, "2026-07-06");
  });

  it("does not use UTC date truncation when local date differs", () => {
    // 2026-07-06 02:30 UTC = 2026-07-05 23:30 in Buenos Aires
    const workDate = resolveWorkDateFromScheduledStart(
      "2026-07-06T02:30:00.000Z",
      timezone,
    );
    assert.equal(workDate, "2026-07-05");
  });

  it("returns deterministic work_date for the same input", () => {
    const start = new Date("2026-07-08T23:30:00.000Z");
    const first = resolveWorkDateFromScheduledStart(start, timezone);
    const second = resolveWorkDateFromScheduledStart(start.toISOString(), timezone);
    assert.equal(first, second);
    assert.equal(first, "2026-07-08");
  });
});
