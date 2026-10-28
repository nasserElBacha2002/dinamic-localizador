import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPreviousPeriodRange, withPreviousPeriodFilters } from "./statistics-period";

const TZ_BA = "America/Argentina/Buenos_Aires";

describe("statistics previous period", () => {
  it("builds an immediately preceding equal calendar-day window", () => {
    // Midday UTC stays on the same local calendar day in Buenos Aires (UTC-3).
    const range = buildPreviousPeriodRange(
      "2026-08-01T12:00:00.000Z",
      "2026-08-31T12:00:00.000Z",
      TZ_BA,
    );
    assert.ok(range);
    assert.equal(range!.dateFrom, "2026-07-01T12:00:00.000Z");
    assert.equal(range!.dateTo, "2026-07-31T12:00:00.000Z");
  });

  it("returns null without both bounds", () => {
    assert.equal(buildPreviousPeriodRange(undefined, "2026-08-31T00:00:00.000Z", TZ_BA), null);
  });

  it("copies filters onto the previous window and clears ranking flags", () => {
    const previous = withPreviousPeriodFilters(
      {
        dateFrom: "2026-08-10T12:00:00.000Z",
        dateTo: "2026-08-12T12:00:00.000Z",
        employeeIds: ["11111111-1111-4111-8111-111111111111"],
        export: true,
        rankingMode: "attention_employees",
        incompleteCoverage: true,
      },
      TZ_BA,
    );
    assert.ok(previous);
    assert.equal(previous!.export, false);
    assert.equal(previous!.rankingMode, undefined);
    assert.equal(previous!.incompleteCoverage, false);
    assert.equal(previous!.openAttendance, false);
    assert.deepEqual(previous!.employeeIds, ["11111111-1111-4111-8111-111111111111"]);
  });

  it("preserves equal day span for UTC companies", () => {
    const range = buildPreviousPeriodRange(
      "2026-03-10T00:00:00.000Z",
      "2026-03-12T23:59:59.999Z",
      "UTC",
    );
    assert.ok(range);
    assert.equal(range!.dateFrom, "2026-03-07T00:00:00.000Z");
    assert.equal(range!.dateTo, "2026-03-09T23:59:59.999Z");
  });
});
