import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyPunchCompleteness,
  detectOperationBusinessChanges,
  emptyOperationalIncidentSummary,
  PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL,
} from "./operational-incident-statistics";

describe("operational incident statistics predicates", () => {
  const base = {
    expectationStatus: "EXPECTED",
    operationStatus: "COMPLETED",
    referenceAt: new Date("2026-06-10T20:00:00.000Z"),
    expectedEndAt: new Date("2026-06-10T18:00:00.000Z"),
    expectedStartAt: new Date("2026-06-10T10:00:00.000Z"),
    lateToleranceMinutes: 30,
  };

  it("classifies complete punch", () => {
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        hasValidArrival: true,
        hasCheckout: true,
      }),
      "COMPLETE",
    );
  });

  it("classifies missing checkout after consolidation", () => {
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        hasValidArrival: true,
        hasCheckout: false,
      }),
      "MISSING_CHECK_OUT",
    );
  });

  it("classifies exit-only as missing check-in", () => {
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        hasValidArrival: false,
        hasCheckout: true,
      }),
      "MISSING_CHECK_IN",
    );
  });

  it("classifies no punch", () => {
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        hasValidArrival: false,
        hasCheckout: false,
      }),
      "NO_PUNCH",
    );
  });

  it("does not consolidate before tolerance window ends", () => {
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        referenceAt: new Date("2026-06-10T18:10:00.000Z"),
        hasValidArrival: true,
        hasCheckout: false,
      }),
      null,
    );
  });

  it("excludes justified and cancelled workdays", () => {
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        expectationStatus: "JUSTIFIED",
        hasValidArrival: false,
        hasCheckout: false,
      }),
      null,
    );
    assert.equal(
      classifyPunchCompleteness({
        ...base,
        operationStatus: "CANCELLED",
        hasValidArrival: false,
        hasCheckout: false,
      }),
      null,
    );
  });

  it("detects business field changes and ignores identical writes", () => {
    assert.deepEqual(
      detectOperationBusinessChanges(
        { scheduledStart: "a", serviceId: "s1" },
        { scheduledStart: "b", serviceId: "s1" },
      ),
      ["scheduledStart"],
    );
    assert.deepEqual(
      detectOperationBusinessChanges(
        { scheduledStart: "a", serviceId: "s1" },
        { scheduledStart: "a", serviceId: "s1" },
      ),
      [],
    );
  });

  it("returns zeroed incident summary with availability metadata", () => {
    const empty = emptyOperationalIncidentSummary();
    assert.equal(empty.operationsWithAnyIncident, 0);
    assert.equal(empty.availability, "AVAILABLE");
    assert.equal(empty.confirmationEligibleAssignments, 0);
    assert.equal(empty.punchEvaluableWorkdays, 0);
    assert.equal(empty.changeTraceableOperations, 0);
    assert.equal(empty.coverageReliableFrom, null);
    assert.equal(empty.coverageEventsReliableHistorically, false);
  });

  it("exports workday-stats punch SQL using CTE column names", () => {
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /expectation_status/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /operation_status/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /late_tolerance_minutes/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /expected_end_at/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /check_in_at/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /check_out_at/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /validation_status/);
    assert.match(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /@referenceAt/);
    assert.doesNotMatch(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /\bar\./);
    assert.doesNotMatch(PUNCH_COMPLETENESS_FROM_WORKDAY_STATS_SQL, /\bow\./);
  });
});
