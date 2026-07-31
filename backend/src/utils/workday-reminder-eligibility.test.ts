import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
  countCandidatesByOperationKind,
  evaluateWorkdayReminderEligibility,
  recurringReminderScheduleVersion,
} from "./workday-reminder-eligibility";

const baseOneTime = {
  operationKind: "ONE_TIME" as const,
  operationStatus: "SCHEDULED",
  operationWorkdayStatus: "ACTIVE",
  employeeWorkdayExpectation: "EXPECTED",
  employeeActive: true,
  assignmentCancelled: false,
  hasValidCheckIn: false,
  hasCheckout: false,
  expectedStartAt: new Date("2026-07-31T12:00:00.000Z"),
  expectedEndAt: new Date("2026-07-31T20:00:00.000Z"),
};

describe("evaluateWorkdayReminderEligibility ONE_TIME reproduction", () => {
  it("is not an arrival candidate before the lead window", () => {
    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      referenceAt: new Date("2026-07-31T11:30:00.000Z"),
    });

    assert.equal(result.arrivalCandidate, false);
    assert.ok(result.rejectionReasons.includes("BEFORE_ARRIVAL_WINDOW"));
  });

  it("becomes an arrival candidate inside the 15-minute lead window", () => {
    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      referenceAt: new Date("2026-07-31T11:50:00.000Z"),
    });

    assert.equal(result.arrivalCandidate, true);
    assert.equal(result.noCheckInCandidate, false);
    assert.equal(result.exitCandidate, false);
  });

  it("does not generate arrival when check-in already exists", () => {
    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      hasValidCheckIn: true,
      referenceAt: new Date("2026-07-31T11:50:00.000Z"),
    });

    assert.equal(result.arrivalCandidate, false);
    assert.ok(result.rejectionReasons.includes("CHECK_IN_EXISTS"));
  });

  it("becomes a no-check-in candidate after start without attendance", () => {
    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      referenceAt: new Date("2026-07-31T12:00:30.000Z"),
    });

    assert.equal(result.noCheckInCandidate, true);
    assert.equal(result.arrivalCandidate, false);
  });

  it("becomes an exit candidate near end after check-in without checkout", () => {
    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      hasValidCheckIn: true,
      referenceAt: new Date("2026-07-31T19:50:00.000Z"),
    });

    assert.equal(result.exitCandidate, true);
    assert.equal(result.arrivalCandidate, false);
    assert.equal(result.noCheckInCandidate, false);
  });

  it("stops being an exit candidate after checkout", () => {
    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      hasValidCheckIn: true,
      hasCheckout: true,
      referenceAt: new Date("2026-07-31T19:50:00.000Z"),
    });

    assert.equal(result.exitCandidate, false);
    assert.ok(result.rejectionReasons.includes("CHECKOUT_EXISTS"));
  });

  it("excludes cancelled and completed operations", () => {
    assert.equal(
      evaluateWorkdayReminderEligibility({
        ...baseOneTime,
        operationStatus: "CANCELLED",
        referenceAt: new Date("2026-07-31T11:50:00.000Z"),
      }).arrivalCandidate,
      false,
    );
    assert.equal(
      evaluateWorkdayReminderEligibility({
        ...baseOneTime,
        operationStatus: "COMPLETED",
        hasValidCheckIn: true,
        referenceAt: new Date("2026-07-31T19:50:00.000Z"),
      }).exitCandidate,
      false,
    );
  });

  it("excludes inactive workdays and non-expected employee workdays", () => {
    assert.equal(
      evaluateWorkdayReminderEligibility({
        ...baseOneTime,
        operationWorkdayStatus: "CANCELLED",
        referenceAt: new Date("2026-07-31T11:50:00.000Z"),
      }).arrivalCandidate,
      false,
    );
    assert.equal(
      evaluateWorkdayReminderEligibility({
        ...baseOneTime,
        employeeWorkdayExpectation: "JUSTIFIED",
        referenceAt: new Date("2026-07-31T11:50:00.000Z"),
      }).arrivalCandidate,
      false,
    );
    assert.equal(
      evaluateWorkdayReminderEligibility({
        ...baseOneTime,
        employeeWorkdayExpectation: "CANCELLED",
        referenceAt: new Date("2026-07-31T11:50:00.000Z"),
      }).arrivalCandidate,
      false,
    );
  });
});

describe("evaluateWorkdayReminderEligibility RECURRING regression", () => {
  it("keeps arrival / no-check-in / exit windows for RECURRING", () => {
    const arrival = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      operationKind: "RECURRING",
      referenceAt: new Date("2026-07-31T11:50:00.000Z"),
    });
    const noCheckIn = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      operationKind: "RECURRING",
      referenceAt: new Date("2026-07-31T12:00:30.000Z"),
    });
    const exit = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      operationKind: "RECURRING",
      hasValidCheckIn: true,
      referenceAt: new Date("2026-07-31T19:50:00.000Z"),
    });

    assert.equal(arrival.arrivalCandidate, true);
    assert.equal(noCheckIn.noCheckInCandidate, true);
    assert.equal(exit.exitCandidate, true);
  });
});

describe("timezone-aware expected instants", () => {
  it("treats local midnight boundary via UTC expected_start_at", () => {
    const localStart = DateTime.fromObject(
      { year: 2026, month: 8, day: 1, hour: 0, minute: 30 },
      { zone: "America/Argentina/Buenos_Aires" },
    );
    const expectedStartAt = localStart.toUTC().toJSDate();
    const referenceAt = localStart.minus({ minutes: 10 }).toUTC().toJSDate();

    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      expectedStartAt,
      expectedEndAt: localStart.plus({ hours: 8 }).toUTC().toJSDate(),
      referenceAt,
    });

    assert.equal(result.arrivalCandidate, true);
  });

  it("handles end time that crosses UTC day boundary", () => {
    const localEnd = DateTime.fromObject(
      { year: 2026, month: 8, day: 1, hour: 0, minute: 30 },
      { zone: "America/Argentina/Buenos_Aires" },
    );
    const expectedEndAt = localEnd.toUTC().toJSDate();
    const referenceAt = localEnd.minus({ minutes: 10 }).toUTC().toJSDate();

    const result = evaluateWorkdayReminderEligibility({
      ...baseOneTime,
      hasValidCheckIn: true,
      expectedStartAt: localEnd.minus({ hours: 8 }).toUTC().toJSDate(),
      expectedEndAt,
      referenceAt,
    });

    assert.equal(result.exitCandidate, true);
  });
});

describe("countCandidatesByOperationKind", () => {
  it("separates ONE_TIME and RECURRING without double-counting", () => {
    const counts = countCandidatesByOperationKind([
      { operationKind: "ONE_TIME" },
      { operationKind: "ONE_TIME" },
      { operationKind: "RECURRING" },
      {},
    ]);

    assert.deepEqual(counts, { ONE_TIME: 2, RECURRING: 1, OTHER: 1 });
  });
});

describe("recurringReminderScheduleVersion", () => {
  it("encodes work_date as YYYYMMDD", () => {
    assert.equal(recurringReminderScheduleVersion(new Date("2026-07-31T15:00:00.000Z")), 20260731);
  });
});
