import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveEmployeeWorkdayState } from "../utils/derive-employee-workday-state";

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

  it("returns EXPECTED while attendance window is open", () => {
    assert.equal(
      deriveEmployeeWorkdayState({
        employeeWorkday: { expectationStatus: "EXPECTED" },
        hasAttendance: false,
        ...schedule,
        referenceAt: new Date("2026-08-10T20:00:00.000Z"),
      }),
      "EXPECTED",
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
