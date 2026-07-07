import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateAbsenceRate,
  calculateAttendanceRate,
  calculatePunctualityRate,
  deriveWorkdayStateCounts,
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

  it("keeps attendance and absence rates complementary subject to rounding", () => {
    const present = 7;
    const absent = 3;
    assert.equal(calculateAttendanceRate(present, absent) + calculateAbsenceRate(present, absent), 100);
  });
});
