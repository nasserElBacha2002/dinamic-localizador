import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allocationsByYearFromBreakdown,
  resolveYearAllocations,
} from "./absence-year-allocations";

describe("allocationsByYearFromBreakdown", () => {
  it("aggregates counted fractions by year including half days", () => {
    const rows = allocationsByYearFromBreakdown([
      { date: "2026-12-30", counted: 1, isWorkingDay: true, reason: "WORKING" },
      { date: "2026-12-31", counted: 0.5, isWorkingDay: true, reason: "PARTIAL" },
      { date: "2027-01-01", counted: 0, isWorkingDay: false, reason: "HOLIDAY" },
      { date: "2027-01-02", counted: 1, isWorkingDay: true, reason: "WORKING" },
    ]);
    assert.deepEqual(rows, [
      { year: 2026, quantity: 1.5 },
      { year: 2027, quantity: 1 },
    ]);
  });
});

describe("resolveYearAllocations", () => {
  it("prefers persisted JSON over approximate split", () => {
    const resolved = resolveYearAllocations({
      persistedJson: JSON.stringify([
        { year: 2026, quantity: 2 },
        { year: 2027, quantity: 3 },
      ]),
      startDate: "2026-12-30",
      endDate: "2027-01-05",
      totalDays: 5,
    });
    assert.equal(resolved.source, "PERSISTED");
    assert.deepEqual(resolved.allocations, [
      { year: 2026, quantity: 2 },
      { year: 2027, quantity: 3 },
    ]);
  });

  it("falls back to legacy approximate when no breakdown/persisted", () => {
    const resolved = resolveYearAllocations({
      startDate: "2026-12-31",
      endDate: "2027-01-01",
      totalDays: 2,
    });
    assert.equal(resolved.source, "LEGACY_APPROXIMATE");
    assert.equal(resolved.allocations.length, 2);
  });
});
