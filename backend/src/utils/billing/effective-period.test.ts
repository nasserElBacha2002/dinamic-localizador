import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doEffectivePeriodsOverlap } from "./effective-period";

describe("billing effective period overlap", () => {
  it("detects overlapping half-open intervals", () => {
    const overlap = doEffectivePeriodsOverlap({
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-06-01T00:00:00.000Z"),
      otherEffectiveFrom: new Date("2026-03-01T00:00:00.000Z"),
      otherEffectiveTo: new Date("2026-09-01T00:00:00.000Z"),
    });
    assert.equal(overlap, true);
  });

  it("treats adjacent intervals as non-overlapping", () => {
    const overlap = doEffectivePeriodsOverlap({
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-06-01T00:00:00.000Z"),
      otherEffectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
      otherEffectiveTo: new Date("2026-12-01T00:00:00.000Z"),
    });
    assert.equal(overlap, false);
  });

  it("supports open-ended intervals", () => {
    const overlap = doEffectivePeriodsOverlap({
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      otherEffectiveFrom: new Date("2026-12-01T00:00:00.000Z"),
      otherEffectiveTo: null,
    });
    assert.equal(overlap, true);
  });
});
