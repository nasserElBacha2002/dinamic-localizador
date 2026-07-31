import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("diagnoseCheckInUnavailability best-effort", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("reports ASSIGNED_OPERATION_SCHEDULE_DRIFT from assignment-based diagnostics", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listAssignedOneTimeDiagnostics",
      async () => [
        {
          operationId: "op-1",
          operationStatus: "SCHEDULED",
          scheduledStart: "2026-07-27T23:30:00.000Z",
          scheduledEnd: "2026-07-28T06:00:00.000Z",
          assignmentId: "asg-1",
          validFrom: "2026-07-16",
          validUntil: "2026-07-16",
          locationActive: true,
          operationWorkdayId: "ow-1",
          workDate: "2026-07-16",
          expectedStartAt: "2026-07-16T23:30:00.000Z",
          expectedEndAt: "2026-07-17T06:00:00.000Z",
          operationWorkdayStatus: "ACTIVE",
          scheduleMatches: false,
          employeeWorkdayId: "ew-1",
          expectationStatus: "EXPECTED",
          hasAttendance: false,
        },
      ],
    );
    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listNearbyWorkdayDiagnostics",
      async () => [],
    );
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));

    const diagnosis = await employeeWorkdayAvailabilityService.diagnoseCheckInUnavailability(
      "company-1",
      "employee-1",
      new Date("2026-07-27T23:35:00.000Z"),
      {
        rawCandidateCount: 0,
        eligibleCandidateCount: 0,
        hasJustifiedWorkdayInWindow: false,
      },
    );

    assert.ok(diagnosis.reasonCodes.includes("ASSIGNED_OPERATION_SCHEDULE_DRIFT"));
    assert.equal(diagnosis.assignedOperationCount, 1);
  });

  it("propagates repository failures so the bot can catch them", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listAssignedOneTimeDiagnostics",
      async () => {
        throw new Error("diag boom");
      },
    );

    await assert.rejects(
      () =>
        employeeWorkdayAvailabilityService.diagnoseCheckInUnavailability(
          "company-1",
          "employee-1",
          new Date(),
          { rawCandidateCount: 0, eligibleCandidateCount: 0, hasJustifiedWorkdayInWindow: false },
        ),
      /diag boom/,
    );
  });
});
