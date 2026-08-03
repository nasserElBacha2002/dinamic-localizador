import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActionExceptions } from "./statistics-action-exceptions";
import type { AttendanceStatisticsSummary } from "../types/statistics";

const baseSummary = (): AttendanceStatisticsSummary => ({
  scheduledWorkdays: 20,
  attendanceRequiredWorkdays: 18,
  presentWorkdays: 15,
  absentWorkdays: 2,
  justifiedWorkdays: 1,
  expectedOpenWorkdays: 1,
  cancelledWorkdays: 1,
  attendanceRate: 88.2,
  absenceRate: 11.8,
  onTimeWorkdays: 12,
  lateWorkdays: 3,
  punctualityRate: 80,
  earlyDepartureWorkdays: 1,
  workedMinutes: 1000,
  overtimeMinutes: 30,
  openAttendanceWorkdays: 2,
  outsideGeofenceCount: 1,
  pendingReviewCount: 1,
  rejectedCount: 0,
  manuallyAcceptedCount: 0,
  totalOperations: 4,
  incompleteCoverageOperations: 1,
  coverageRate: 83.3,
  hoursDataIncomplete: true,
  locationEvaluableWorkdays: 14,
  validationEvaluableWorkdays: 15,
  checkoutEvaluableWorkdays: 13,
});

describe("buildActionExceptions", () => {
  it("returns non-exclusive categories with per-exception denominators", () => {
    const items = buildActionExceptions(baseSummary());
    assert.ok(items.length >= 4);
    assert.equal(items[0]?.key, "late_arrival");
    assert.equal(items.find((i) => i.key === "unjustified_absence")?.count, 2);
    assert.equal(items.find((i) => i.key === "unjustified_absence")?.denominator, 17);
    assert.equal(items.find((i) => i.key === "late_arrival")?.denominator, 15);
    assert.equal(items.find((i) => i.key === "open_attendance")?.denominator, 15);
    assert.equal(items.find((i) => i.key === "outside_geofence")?.denominator, 14);
    assert.equal(items.find((i) => i.key === "early_departure")?.denominator, 13);
  });

  it("omits zero counts and null rate when denominator is zero", () => {
    const empty = buildActionExceptions({
      ...baseSummary(),
      presentWorkdays: 0,
      absentWorkdays: 0,
      expectedOpenWorkdays: 0,
      lateWorkdays: 0,
      openAttendanceWorkdays: 0,
      outsideGeofenceCount: 0,
      pendingReviewCount: 0,
      earlyDepartureWorkdays: 2,
      checkoutEvaluableWorkdays: 0,
    });
    assert.equal(empty.length, 1);
    assert.equal(empty[0]?.key, "early_departure");
    assert.equal(empty[0]?.rate, null);
  });
});
