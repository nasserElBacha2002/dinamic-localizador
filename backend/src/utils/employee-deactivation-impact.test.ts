import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeactivationImpactRow,
  hasOperationalTemporalImpact,
  isAssignmentPeriodOpen,
  type DeactivationImpactCandidate,
} from "./employee-deactivation-impact";
import { __employeeDeactivationTestUtils } from "../services/employee-deactivation.service";

const baseCandidate = (
  overrides: Partial<DeactivationImpactCandidate> = {},
): DeactivationImpactCandidate => ({
  assignmentId: "a1",
  operationId: "o1",
  operationKind: "ONE_TIME",
  operationStatus: "SCHEDULED",
  workdayId: null,
  employeeWorkdayId: null,
  date: null,
  expectedStartAt: null,
  expectedEndAt: null,
  scheduledStart: "2026-08-01T12:00:00.000Z",
  scheduledEnd: "2026-08-01T18:00:00.000Z",
  assignmentValidFrom: "2026-08-01",
  assignmentValidUntil: "2026-08-01",
  assignmentCancelledAt: null,
  locationName: "Sucursal Palermo",
  workTeamName: null,
  ...overrides,
});

describe("employee deactivation impact rules", () => {
  it("allows direct deactivation when assignment period already ended", () => {
    assert.equal(
      isAssignmentPeriodOpen({
        validFrom: "2026-01-01",
        validUntil: "2026-01-02",
        cancelledAt: null,
        companyTodayIso: "2026-07-21",
      }),
      false,
    );
  });

  it("excludes cancelled and completed operations", () => {
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "COMPLETED",
        operationKind: "ONE_TIME",
        companyTodayIso: "2026-07-21",
        referenceAt: new Date("2026-07-21T15:00:00.000Z"),
        workDate: "2026-07-25",
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: null,
        scheduledEnd: null,
      }),
      false,
    );
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "CANCELLED",
        operationKind: "ONE_TIME",
        companyTodayIso: "2026-07-21",
        referenceAt: new Date("2026-07-21T15:00:00.000Z"),
        workDate: "2026-07-25",
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: null,
        scheduledEnd: null,
      }),
      false,
    );
  });

  it("includes in-progress operations even if calendar date is stale", () => {
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "IN_PROGRESS",
        operationKind: "ONE_TIME",
        companyTodayIso: "2026-07-21",
        referenceAt: new Date("2026-07-21T15:00:00.000Z"),
        workDate: "2026-07-01",
        expectedStartAt: "2026-07-01T12:00:00.000Z",
        expectedEndAt: "2026-07-01T18:00:00.000Z",
        scheduledStart: null,
        scheduledEnd: null,
      }),
      true,
    );
  });

  it("excludes past SCHEDULED one-time ops whose window already ended (stale status)", () => {
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "SCHEDULED",
        operationKind: "ONE_TIME",
        companyTodayIso: "2026-07-21",
        referenceAt: new Date("2026-07-21T15:00:00.000Z"),
        workDate: null,
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: "2026-06-01T12:00:00.000Z",
        scheduledEnd: "2026-06-01T18:00:00.000Z",
      }),
      false,
    );
  });

  it("includes future SCHEDULED one-time ops", () => {
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "SCHEDULED",
        operationKind: "ONE_TIME",
        companyTodayIso: "2026-07-21",
        referenceAt: new Date("2026-07-21T15:00:00.000Z"),
        workDate: null,
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: "2026-08-01T12:00:00.000Z",
        scheduledEnd: "2026-08-01T18:00:00.000Z",
      }),
      true,
    );
  });

  it("keeps future recurring workdays and drops past completed ones via filter", () => {
    const companyTodayIso = "2026-07-21";
    const referenceAt = new Date("2026-07-21T15:00:00.000Z");
    const filtered = __employeeDeactivationTestUtils.filterImpactCandidates(
      [
        baseCandidate({
          operationKind: "RECURRING",
          date: "2026-07-10",
          expectedStartAt: "2026-07-10T12:00:00.000Z",
          expectedEndAt: "2026-07-10T18:00:00.000Z",
          assignmentValidFrom: "2026-07-01",
          assignmentValidUntil: null,
        }),
        baseCandidate({
          assignmentId: "a2",
          operationKind: "RECURRING",
          date: "2026-07-25",
          expectedStartAt: "2026-07-25T12:00:00.000Z",
          expectedEndAt: "2026-07-25T18:00:00.000Z",
          assignmentValidFrom: "2026-07-01",
          assignmentValidUntil: null,
        }),
      ],
      companyTodayIso,
      referenceAt,
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.date, "2026-07-25");
  });

  it("formats local clock times for impact rows", () => {
    const row = buildDeactivationImpactRow(
      baseCandidate({
        expectedStartAt: "2026-08-01T12:00:00.000Z",
        expectedEndAt: "2026-08-01T17:00:00.000Z",
      }),
      "America/Argentina/Buenos_Aires",
    );
    assert.equal(row.startTime, "09:00");
    assert.equal(row.endTime, "14:00");
    assert.equal(row.operationName, "Sucursal Palermo");
  });
});
