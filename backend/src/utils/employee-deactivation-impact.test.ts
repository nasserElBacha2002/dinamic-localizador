import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDeactivationReleasePlan,
  hasOperationalTemporalImpact,
  isAssignmentPeriodOpen,
  resolveOperationDisplayName,
  summarizeDeactivationImpact,
  type DeactivationAssignmentSnapshot,
} from "./employee-deactivation-impact";

const baseAssignment = (
  overrides: Partial<DeactivationAssignmentSnapshot> = {},
): DeactivationAssignmentSnapshot => ({
  assignmentId: "a1",
  operationId: "o1",
  operationKind: "ONE_TIME",
  operationStatus: "SCHEDULED",
  operationNotes: null,
  locationName: "Sucursal Palermo",
  workTeamName: null,
  scheduledStart: "2026-08-01T12:00:00.000Z",
  scheduledEnd: "2026-08-01T18:00:00.000Z",
  validFrom: "2026-08-01",
  validUntil: "2026-08-01",
  cancelledAt: null,
  workdays: [],
  ...overrides,
});

describe("employee deactivation release plan", () => {
  const companyTodayIso = "2026-07-21";
  const referenceAt = new Date("2026-07-21T15:00:00.000Z");
  const timezone = "America/Argentina/Buenos_Aires";

  it("allows direct deactivation when assignment period already ended", () => {
    assert.equal(
      isAssignmentPeriodOpen({
        validFrom: "2026-01-01",
        validUntil: "2026-01-02",
        cancelledAt: null,
        companyTodayIso,
      }),
      false,
    );
  });

  it("excludes cancelled and completed operations", () => {
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "COMPLETED",
        operationKind: "ONE_TIME",
        companyTodayIso,
        referenceAt,
        workDate: "2026-07-25",
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: null,
        scheduledEnd: null,
      }),
      false,
    );
  });

  it("cancels a completely future assignment", () => {
    const plan = buildDeactivationReleasePlan({
      assignments: [
        baseAssignment({
          validFrom: "2026-08-01",
          validUntil: "2026-08-01",
          workdays: [
            {
              employeeWorkdayId: "ew1",
              operationWorkdayId: "ow1",
              workDate: "2026-08-01",
              expectationStatus: "EXPECTED",
              hasAttendance: false,
              expectedStartAt: "2026-08-01T12:00:00.000Z",
              expectedEndAt: "2026-08-01T18:00:00.000Z",
            },
          ],
        }),
      ],
      companyTodayIso,
      referenceAt,
      timezone,
    });

    assert.deepEqual(plan.assignmentsToCancel, ["a1"]);
    assert.deepEqual(plan.assignmentsToEnd, []);
    assert.deepEqual(plan.employeeWorkdayIdsToCancel, ["ew1"]);
    assert.equal(plan.affectedAssignmentIds.length, 1);
  });

  it("closes historical assignment without cancelling it, even without attendance", () => {
    const plan = buildDeactivationReleasePlan({
      assignments: [
        baseAssignment({
          operationKind: "RECURRING",
          validFrom: "2026-07-01",
          validUntil: null,
          workdays: [
            {
              employeeWorkdayId: "ew-past",
              operationWorkdayId: "ow-past",
              workDate: "2026-07-10",
              expectationStatus: "EXPECTED",
              hasAttendance: false,
              expectedStartAt: "2026-07-10T12:00:00.000Z",
              expectedEndAt: "2026-07-10T18:00:00.000Z",
            },
            {
              employeeWorkdayId: "ew-future",
              operationWorkdayId: "ow-future",
              workDate: "2026-07-25",
              expectationStatus: "EXPECTED",
              hasAttendance: false,
              expectedStartAt: "2026-07-25T12:00:00.000Z",
              expectedEndAt: "2026-07-25T18:00:00.000Z",
            },
          ],
        }),
      ],
      companyTodayIso,
      referenceAt,
      timezone,
    });

    assert.deepEqual(plan.assignmentsToCancel, []);
    assert.deepEqual(plan.assignmentsToEnd, [{ assignmentId: "a1", effectiveDate: "2026-07-20" }]);
    assert.deepEqual(plan.employeeWorkdayIdsToCancel, ["ew-future"]);
    assert.equal(plan.affectedWorkdayRows.length, 1);
    assert.equal(plan.affectedAssignmentIds.length, 1);
  });

  it("keeps today inclusive when today already has attendance", () => {
    const plan = buildDeactivationReleasePlan({
      assignments: [
        baseAssignment({
          operationKind: "RECURRING",
          operationStatus: "IN_PROGRESS",
          validFrom: "2026-07-01",
          validUntil: null,
          workdays: [
            {
              employeeWorkdayId: "ew-today",
              operationWorkdayId: "ow-today",
              workDate: "2026-07-21",
              expectationStatus: "EXPECTED",
              hasAttendance: true,
              expectedStartAt: "2026-07-21T12:00:00.000Z",
              expectedEndAt: "2026-07-21T18:00:00.000Z",
            },
            {
              employeeWorkdayId: "ew-future",
              operationWorkdayId: "ow-future",
              workDate: "2026-07-22",
              expectationStatus: "EXPECTED",
              hasAttendance: false,
              expectedStartAt: "2026-07-22T12:00:00.000Z",
              expectedEndAt: "2026-07-22T18:00:00.000Z",
            },
          ],
        }),
      ],
      companyTodayIso,
      referenceAt,
      timezone,
    });

    assert.deepEqual(plan.employeeWorkdayIdsToCancel, ["ew-future"]);
    assert.deepEqual(plan.assignmentsToEnd, [{ assignmentId: "a1", effectiveDate: "2026-07-21" }]);
  });

  it("does not touch cancelled operations", () => {
    const plan = buildDeactivationReleasePlan({
      assignments: [baseAssignment({ operationStatus: "CANCELLED" })],
      companyTodayIso,
      referenceAt,
      timezone,
    });
    assert.equal(plan.affectedAssignmentIds.length, 0);
  });

  it("excludes stale past SCHEDULED one-time ops", () => {
    assert.equal(
      hasOperationalTemporalImpact({
        operationStatus: "SCHEDULED",
        operationKind: "ONE_TIME",
        companyTodayIso,
        referenceAt,
        workDate: null,
        expectedStartAt: null,
        expectedEndAt: null,
        scheduledStart: "2026-06-01T12:00:00.000Z",
        scheduledEnd: "2026-06-01T18:00:00.000Z",
      }),
      false,
    );
  });

  it("separates operation display name from location name", () => {
    assert.equal(
      resolveOperationDisplayName({
        notes: "Inventario Palermo",
        locationName: "Sucursal Palermo",
        date: "2026-07-25",
        scheduledStart: null,
      }),
      "Inventario Palermo",
    );
    assert.equal(
      resolveOperationDisplayName({
        notes: null,
        locationName: "Sucursal Palermo",
        date: "2026-07-25",
        scheduledStart: null,
      }),
      "Sucursal Palermo · 25/07/2026",
    );
  });

  it("summarizes assignment and workday counts separately and requires team confirmation", () => {
    const plan = buildDeactivationReleasePlan({
      assignments: [
        baseAssignment({
          operationKind: "RECURRING",
          validFrom: "2026-07-01",
          validUntil: null,
          workdays: [
            {
              employeeWorkdayId: "ew1",
              operationWorkdayId: "ow1",
              workDate: "2026-07-25",
              expectationStatus: "EXPECTED",
              hasAttendance: false,
              expectedStartAt: "2026-07-25T12:00:00.000Z",
              expectedEndAt: "2026-07-25T18:00:00.000Z",
            },
            {
              employeeWorkdayId: "ew2",
              operationWorkdayId: "ow2",
              workDate: "2026-07-26",
              expectationStatus: "EXPECTED",
              hasAttendance: false,
              expectedStartAt: "2026-07-26T12:00:00.000Z",
              expectedEndAt: "2026-07-26T18:00:00.000Z",
            },
          ],
        }),
      ],
      companyTodayIso,
      referenceAt,
      timezone,
    });

    const summary = summarizeDeactivationImpact({ plan, workTeamCount: 1 });
    assert.equal(summary.affectedAssignmentsCount, 1);
    assert.equal(summary.affectedWorkdaysCount, 2);
    assert.equal(summary.requiresConfirmation, true);
    assert.equal(summary.canDeactivateDirectly, false);
  });
});
