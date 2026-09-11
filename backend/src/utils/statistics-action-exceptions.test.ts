import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActionExceptions } from "./statistics-action-exceptions";
import type { AttendanceStatisticsSummary } from "../types/statistics";
import { emptyOperationalIncidentSummary } from "./operational-incident-statistics";

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
  operationalIncidentsStatus: "AVAILABLE",
  operationalIncidents: {
    ...emptyOperationalIncidentSummary(),
    operationsWithCoverage: 2,
    coverageEvents: 3,
    modifiedOperations: 1,
    operationChangeEvents: 2,
    notConfirmedBeforeStart: 4,
    missingCheckIn: 1,
    missingCheckOut: 2,
    noPunch: 3,
    incompleteWorkdays: 6,
    evaluableOperations: 10,
    confirmationEligibleAssignments: 8,
    punchEvaluableWorkdays: 12,
    changeTraceableOperations: 9,
  },
});

describe("buildActionExceptions", () => {
  it("returns non-exclusive categories with per-exception denominators", () => {
    const items = buildActionExceptions(baseSummary());
    assert.ok(items.length >= 4);
    assert.equal(items.find((i) => i.key === "unjustified_absence")?.count, 2);
    assert.equal(items.find((i) => i.key === "unjustified_absence")?.denominator, 17);
    assert.equal(items.find((i) => i.key === "late_arrival")?.denominator, 15);
    assert.equal(items.find((i) => i.key === "open_attendance")?.denominator, 15);
    assert.equal(items.find((i) => i.key === "outside_geofence")?.denominator, 14);
    assert.equal(items.find((i) => i.key === "early_departure")?.denominator, 13);
    assert.equal(items.find((i) => i.key === "coverage_required")?.count, 2);
    assert.equal(items.find((i) => i.key === "coverage_required")?.denominator, 10);
    assert.equal(items.find((i) => i.key === "operation_modified")?.count, 1);
    assert.equal(items.find((i) => i.key === "operation_modified")?.denominator, 9);
    assert.equal(items.find((i) => i.key === "not_confirmed")?.count, 4);
    assert.equal(items.find((i) => i.key === "not_confirmed")?.denominator, 8);
    assert.equal(items.find((i) => i.key === "missing_check_in")?.denominator, 12);
    assert.equal(items.find((i) => i.key === "missing_check_out")?.count, 2);
    assert.equal(items.find((i) => i.key === "missing_check_out")?.denominator, 12);
    assert.equal(items.find((i) => i.key === "no_punch")?.count, 3);
    assert.equal(items.find((i) => i.key === "no_punch")?.denominator, 12);
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
      operationalIncidents: emptyOperationalIncidentSummary(),
    });
    assert.equal(empty.length, 1);
    assert.equal(empty[0]?.key, "early_departure");
    assert.equal(empty[0]?.rate, null);
  });

  it("skips incident exception keys when operationalIncidents is null", () => {
    const items = buildActionExceptions({
      ...baseSummary(),
      operationalIncidents: null,
      operationalIncidentsStatus: "UNAVAILABLE",
    });
    assert.equal(items.find((i) => i.key === "coverage_required"), undefined);
    assert.equal(items.find((i) => i.key === "operation_modified"), undefined);
    assert.equal(items.find((i) => i.key === "not_confirmed"), undefined);
    assert.equal(items.find((i) => i.key === "missing_check_in"), undefined);
    assert.equal(items.find((i) => i.key === "no_punch"), undefined);
    assert.ok(items.some((i) => i.key === "late_arrival"));
  });

  it("returns null rate for incident exceptions when denominator is zero", () => {
    const items = buildActionExceptions({
      ...baseSummary(),
      operationalIncidents: {
        ...emptyOperationalIncidentSummary(),
        operationsWithCoverage: 2,
        modifiedOperations: 1,
        notConfirmedBeforeStart: 3,
        missingCheckIn: 1,
        missingCheckOut: 1,
        noPunch: 1,
        evaluableOperations: 0,
        confirmationEligibleAssignments: 0,
        punchEvaluableWorkdays: 0,
        changeTraceableOperations: 0,
      },
    });
    assert.equal(items.find((i) => i.key === "coverage_required")?.rate, null);
    assert.equal(items.find((i) => i.key === "not_confirmed")?.rate, null);
    assert.equal(items.find((i) => i.key === "no_punch")?.rate, null);
  });
});
