import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveEmployeeWorkdayState,
  isAttendanceOpportunityOpen,
} from "./derive-employee-workday-state";

describe("deriveEmployeeWorkdayState", () => {
  const schedule = {
    expectedStartAt: "2026-08-10T12:00:00.000Z",
    expectedEndAt: "2026-08-10T21:00:00.000Z",
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 20,
  };

  it("returns CANCELLED for cancelled expectations", () => {
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "CANCELLED" },
        hasAttendance: false,
        ...schedule,
      }),
      "CANCELLED",
    );
  });

  it("returns JUSTIFIED for justified expectations", () => {
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "JUSTIFIED" },
        hasAttendance: false,
        ...schedule,
      }),
      "JUSTIFIED",
    );
  });

  it("returns PRESENT when attendance exists", () => {
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "EXPECTED" },
        hasAttendance: true,
        ...schedule,
      }),
      "PRESENT",
    );
  });

  it("returns ABSENT after attendance window closes without attendance", () => {
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "EXPECTED" },
        hasAttendance: false,
        ...schedule,
        referenceAt: new Date("2026-08-11T10:00:00.000Z"),
      }),
      "ABSENT",
    );
  });
});

describe("isAttendanceOpportunityOpen", () => {
  const startAt = "2026-08-10T12:00:00.000Z";

  it("applies late tolerance once when expectedEndAt is null", () => {
    assert.equal(
      isAttendanceOpportunityOpen({
        expectedStartAt: startAt,
        expectedEndAt: null,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 20,
        referenceAt: new Date("2026-08-10T12:19:59.999Z"),
      }),
      true,
    );
    assert.equal(
      isAttendanceOpportunityOpen({
        expectedStartAt: startAt,
        expectedEndAt: null,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 20,
        referenceAt: new Date("2026-08-10T12:20:00.000Z"),
      }),
      true,
    );
    assert.equal(
      isAttendanceOpportunityOpen({
        expectedStartAt: startAt,
        expectedEndAt: null,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 20,
        referenceAt: new Date("2026-08-10T12:20:00.001Z"),
      }),
      false,
    );
  });

  it("extends opportunity end by late tolerance when expectedEndAt exists", () => {
    assert.equal(
      isAttendanceOpportunityOpen({
        expectedStartAt: startAt,
        expectedEndAt: "2026-08-10T21:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 20,
        referenceAt: new Date("2026-08-10T21:20:00.000Z"),
      }),
      true,
    );
    assert.equal(
      isAttendanceOpportunityOpen({
        expectedStartAt: startAt,
        expectedEndAt: "2026-08-10T21:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 20,
        referenceAt: new Date("2026-08-10T21:20:00.001Z"),
      }),
      false,
    );
  });
});
