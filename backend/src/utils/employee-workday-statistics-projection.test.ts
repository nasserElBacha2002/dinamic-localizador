import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { deriveEmployeeWorkdayState } from "./derive-employee-workday-state";
import { EFFECTIVE_STATE_SQL } from "./employee-workday-statistics-projection";

const schedule = {
  expectedStartAt: "2026-08-10T12:00:00.000Z",
  expectedEndAt: "2026-08-10T21:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
};

const deriveFromDomain = (input: {
  expectationStatus: "EXPECTED" | "JUSTIFIED" | "CANCELLED";
  hasAttendance: boolean;
  referenceAt: Date;
}) =>
  deriveEmployeeWorkdayState({
    employeeWorkday: { expectationStatus: input.expectationStatus },
    hasAttendance: input.hasAttendance,
    ...schedule,
    referenceAt: input.referenceAt,
  });

describe("employee-workday-statistics-projection contract", () => {
  const repositorySource = readFileSync(
    join(process.cwd(), "src/repositories/statistics.repository.ts"),
    "utf8",
  );
  const projectionSource = readFileSync(
    join(process.cwd(), "src/utils/employee-workday-statistics-projection.ts"),
    "utf8",
  );

  const canonicalSource = readFileSync(
    join(process.cwd(), "src/utils/statistics-canonical-attendance.ts"),
    "utf8",
  );

  it("uses EmployeeWorkday as the analytical base grain", () => {
    assert.match(projectionSource, /FROM employee_workdays ew/);
    assert.match(repositorySource, /employee_workday_statistics/);
    assert.doesNotMatch(repositorySource, /operation_kind = N'ONE_TIME'/);
  });

  it("uses canonical production attendance and does not filter by assignment state", () => {
    assert.match(projectionSource, /CANONICAL_PRODUCTION_ATTENDANCE_APPLY/);
    assert.match(canonicalSource, /OUTER APPLY/);
    assert.match(canonicalSource, /ar\.is_simulation = 0/);
    assert.doesNotMatch(projectionSource, /operation_assignments/);
    assert.doesNotMatch(projectionSource, /oa\.cancelled_at/);
  });

  it("documents SQL precedence aligned with deriveEmployeeWorkdayState", () => {
    assert.match(EFFECTIVE_STATE_SQL, /WHEN ew\.expectation_status = N'CANCELLED'/);
    assert.match(EFFECTIVE_STATE_SQL, /WHEN ew\.expectation_status = N'JUSTIFIED'/);
    assert.match(EFFECTIVE_STATE_SQL, /WHEN ar\.id IS NOT NULL/);
    assert.match(EFFECTIVE_STATE_SQL, /THEN N'EXPECTED'/);
    assert.match(EFFECTIVE_STATE_SQL, /ELSE N'ABSENT'/);
  });

  it("matches domain resolver for open and closed expected workdays", () => {
    const openReference = new Date("2026-08-10T20:00:00.000Z");
    const closedReference = new Date("2026-08-11T10:00:00.000Z");

    assert.equal(
      deriveFromDomain({
        expectationStatus: "EXPECTED",
        hasAttendance: false,
        referenceAt: openReference,
      }),
      "EXPECTED",
    );
    assert.equal(
      deriveFromDomain({
        expectationStatus: "EXPECTED",
        hasAttendance: false,
        referenceAt: closedReference,
      }),
      "ABSENT",
    );
  });

  it("matches domain resolver for justified and present workdays", () => {
    assert.equal(
      deriveFromDomain({
        expectationStatus: "JUSTIFIED",
        hasAttendance: false,
        referenceAt: new Date("2026-08-11T10:00:00.000Z"),
      }),
      "JUSTIFIED",
    );
    assert.equal(
      deriveFromDomain({
        expectationStatus: "EXPECTED",
        hasAttendance: true,
        referenceAt: new Date("2026-08-11T10:00:00.000Z"),
      }),
      "PRESENT",
    );
  });
});
