import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAbsenceRate,
  calculateAttendanceRate,
  calculateConsolidatedCoverageRate,
  calculateCoverageRate,
  calculatePunctualityRate,
  deriveWorkdayStateCounts,
  hasSufficientSample,
  buildNormalizedIncidentRate,
  buildPeriodMetricDelta,
  buildRateDelta,
} from "./attendance-statistics-metrics";

describe("attendance-statistics-metrics", () => {
  it("derives mixed effective-state counts for the Phase 7 reference dataset", () => {
    const counts = deriveWorkdayStateCounts([
      "PRESENT",
      "ABSENT",
      "JUSTIFIED",
      "EXPECTED",
      "CANCELLED",
    ]);

    assert.deepEqual(counts, {
      scheduledWorkdays: 4,
      attendanceRequiredWorkdays: 3,
      presentWorkdays: 1,
      absentWorkdays: 1,
      justifiedWorkdays: 1,
      expectedOpenWorkdays: 1,
      cancelledWorkdays: 1,
    });
  });

  it("calculates attendance and absence rates over resolved opportunities only", () => {
    assert.equal(calculateAttendanceRate(19, 1), 95);
    assert.equal(calculateAbsenceRate(19, 1), 5);
    assert.equal(calculateAttendanceRate(1, 1), 50);
    assert.equal(calculateAbsenceRate(1, 1), 50);
  });

  it("calculates punctuality over attended evaluable arrivals only", () => {
    assert.equal(calculatePunctualityRate(8, 2), 80);
    assert.equal(calculatePunctualityRate(0, 0), 0);
  });

  it("calculates consolidated coverage as present over present+absent", () => {
    assert.equal(calculateConsolidatedCoverageRate(2, 1), 66.7);
    assert.equal(calculateConsolidatedCoverageRate(0, 0), 0);
  });

  it("keeps legacy coverage helper for present over expected staff", () => {
    assert.equal(calculateCoverageRate(8, 10), 80);
    assert.equal(calculateCoverageRate(0, 0), 0);
  });

  it("applies minimum sample for rankings and comparisons", () => {
    assert.equal(hasSufficientSample(2, 3), false);
    assert.equal(hasSufficientSample(3, 3), true);
    const delta = buildPeriodMetricDelta(90, 80, 2, 10, 3);
    assert.equal(delta.comparable, false);
    assert.equal(delta.percentDelta, null);
    const ok = buildPeriodMetricDelta(90, 80, 5, 5, 3);
    assert.equal(ok.comparable, true);
    assert.equal(ok.percentDelta, 12.5);
  });

  it("does not flag deterioration when count doubles with volume", () => {
    const sameRate = buildRateDelta(
      buildNormalizedIncidentRate(4, 20),
      buildNormalizedIncidentRate(2, 10),
      20,
      10,
      3,
    );
    assert.equal(sameRate.current, 20);
    assert.equal(sameRate.previous, 20);
    assert.equal(sameRate.absoluteDelta, 0);
    assert.equal(sameRate.comparable, true);
  });

  it("keeps attendance and absence rates complementary subject to rounding", () => {
    const present = 7;
    const absent = 3;
    assert.equal(calculateAttendanceRate(present, absent) + calculateAbsenceRate(present, absent), 100);
  });
});
