import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { deriveEmployeeWorkdayState } from "./derive-employee-workday-state";
import {
  buildEmployeeWorkdayStatisticsFilters,
  CONFIRMATION_STATUS_SQL,
  EFFECTIVE_STATE_SQL,
} from "./employee-workday-statistics-projection";

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
    assert.match(projectionSource, /ow\.operation_shift_id/);
    assert.match(projectionSource, /ow\.shift_name_snapshot/);
  });

  it("uses canonical production attendance and keeps assignment confirmation tenant-scoped", () => {
    assert.match(projectionSource, /CANONICAL_PRODUCTION_ATTENDANCE_APPLY/);
    assert.match(canonicalSource, /OUTER APPLY/);
    assert.match(canonicalSource, /ar\.is_simulation = 0/);
    assert.match(projectionSource, /LEFT JOIN operation_assignments oa/);
    assert.match(projectionSource, /oa\.id = ew\.operation_assignment_id/);
    assert.match(projectionSource, /oa\.company_id = ew\.company_id/);
    assert.doesNotMatch(projectionSource, /oa\.cancelled_at/);
  });

  it("documents SQL precedence aligned with deriveEmployeeWorkdayState", () => {
    assert.match(EFFECTIVE_STATE_SQL, /WHEN ew\.expectation_status = N'CANCELLED'/);
    assert.match(EFFECTIVE_STATE_SQL, /WHEN ew\.expectation_status = N'JUSTIFIED'/);
    assert.match(
      EFFECTIVE_STATE_SQL,
      /ar\.validation_status IN \(N'VALID', N'PENDING_REVIEW'\) THEN N'PRESENT'/,
    );
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

  it("applies confirmationStatus with workday unavailability taking precedence", () => {
    const companyId = "11111111-1111-1111-1111-111111111111";
    for (const status of ["PENDING", "CONFIRMED", "UNAVAILABLE"] as const) {
      const filters = buildEmployeeWorkdayStatisticsFilters(companyId, {
        confirmationStatus: status,
      } as Parameters<typeof buildEmployeeWorkdayStatisticsFilters>[1]);
      const filter = filters.find((item) => item.clause.includes("@workdayConfirmationStatus"));
      assert.ok(filter, `missing confirmationStatus filter for ${status}`);
      const bound: Record<string, unknown> = {};
      filter.apply({
        input: (name: string, _type: unknown, value: unknown) => {
          bound[name] = value;
        },
      } as never);
      assert.deepEqual(bound, { workdayConfirmationStatus: status });
    }

    const unfiltered = buildEmployeeWorkdayStatisticsFilters(
      companyId,
      {} as Parameters<typeof buildEmployeeWorkdayStatisticsFilters>[1],
    );
    assert.equal(
      unfiltered.some((item) => item.clause.includes("@workdayConfirmationStatus")),
      false,
    );
    const pending = buildEmployeeWorkdayStatisticsFilters(companyId, {
      confirmationStatus: "PENDING",
    } as Parameters<typeof buildEmployeeWorkdayStatisticsFilters>[1]);
    assert.equal(
      pending.some((item) => /@confirmationStatus\b/.test(item.clause)),
      false,
      "must not collide with @confirmationStatus bound by incident repositories",
    );

    assert.match(CONFIRMATION_STATUS_SQL, /WHEN ew\.unavailable_at IS NOT NULL THEN N'UNAVAILABLE'/);
    assert.match(CONFIRMATION_STATUS_SQL, /ELSE oa\.confirmation_status/);
  });
});
