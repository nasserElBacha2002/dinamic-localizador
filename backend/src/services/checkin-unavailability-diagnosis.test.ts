import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("diagnoseCheckInUnavailability best-effort", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("reports WORKDAY_NOT_ACTIVE from nearby candidate diagnostics", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listNearbyWorkdayDiagnostics",
      async () => [
        {
          operationId: "op-1",
          operationKind: "ONE_TIME",
          operationWorkdayId: "ow-1",
          employeeWorkdayId: "ew-1",
          workDate: "2026-07-27",
          expectedStartAt: "2026-07-27T23:30:00.000Z",
          expectedEndAt: "2026-07-28T06:00:00.000Z",
          expectationStatus: "EXPECTED",
          operationWorkdayStatus: "CANCELLED",
          operationStatus: "SCHEDULED",
          locationActive: true,
          hasAttendance: false,
          priorAttendanceId: null,
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 30,
        },
      ],
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

    assert.ok(diagnosis.reasonCodes.includes("WORKDAY_NOT_ACTIVE"));
    assert.equal(diagnosis.assignedOperationCount, 1);
  });

  it("propagates repository failures so the bot can catch them", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listNearbyWorkdayDiagnostics",
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
