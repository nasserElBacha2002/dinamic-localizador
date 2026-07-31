import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { EmployeeWorkdayCheckInCandidate } from "../types/employee-workday-availability";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "11111111-1111-1111-1111-111111111111";
const employeeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const baseCandidate = (
  overrides: Partial<EmployeeWorkdayCheckInCandidate> = {},
): EmployeeWorkdayCheckInCandidate => ({
  employeeWorkdayId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  operationWorkdayId: "22222222-2222-2222-2222-222222222222",
  operationId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  serviceId: "33333333-3333-3333-3333-333333333333",
  serviceName: "Depósito Norte",
  serviceAddress: "Av. Rivadavia 5108",
  serviceLocality: "Caballito",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  allowedRadiusMeters: 150,
  operationKind: "RECURRING",
  workDate: "2026-07-31",
  expectedStartAt: "2026-07-31T12:00:00.000Z",
  expectedEndAt: "2026-07-31T20:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  scheduleTimezone: "America/Argentina/Buenos_Aires",
  expectationStatus: "EXPECTED",
  absenceRequestId: null,
  operationAssignmentId: null,
  ...overrides,
});

describe("employeeWorkdayAvailabilityService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("includes mid-shift recurring candidates as LATE-available", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(employeeWorkdayAvailabilityRepository, "listCheckInCandidates", async () => [
      baseCandidate(),
    ]);
    mock.method(employeeWorkdayAvailabilityRepository, "hasJustifiedWorkdayInRange", async () => false);
    const { operationRepository } = await import("../repositories/operation.repository");
    mock.method(operationRepository, "findCompatibleForEmployee", async () => []);

    const at = new Date("2026-07-31T14:41:51.000Z");
    const result = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
      companyId,
      employeeId,
      at,
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.employeeWorkdayId, "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
  });

  it("excludes candidates after expected end", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(employeeWorkdayAvailabilityRepository, "listCheckInCandidates", async () => [
      baseCandidate(),
    ]);
    mock.method(employeeWorkdayAvailabilityRepository, "hasJustifiedWorkdayInRange", async () => false);
    const { operationRepository } = await import("../repositories/operation.repository");
    mock.method(operationRepository, "findCompatibleForEmployee", async () => []);

    const at = new Date("2026-07-31T20:00:00.000Z");
    const result = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
      companyId,
      employeeId,
      at,
    );

    assert.equal(result.candidates.length, 0);
  });

  it("orders candidates deterministically", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(employeeWorkdayAvailabilityRepository, "listCheckInCandidates", async () => [
      baseCandidate({
        employeeWorkdayId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        serviceName: "Zona Sur",
        expectedStartAt: "2026-07-31T12:30:00.000Z",
        expectedEndAt: "2026-07-31T20:30:00.000Z",
      }),
      baseCandidate({
        employeeWorkdayId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        serviceName: "Depósito Norte",
        expectedStartAt: "2026-07-31T12:00:00.000Z",
      }),
    ]);
    mock.method(employeeWorkdayAvailabilityRepository, "hasJustifiedWorkdayInRange", async () => false);
    const { operationRepository } = await import("../repositories/operation.repository");
    mock.method(operationRepository, "findCompatibleForEmployee", async () => []);

    const at = new Date("2026-07-31T12:20:00.000Z");
    const result = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
      companyId,
      employeeId,
      at,
    );

    assert.equal(result.candidates[0]?.employeeWorkdayId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    assert.equal(result.candidates[1]?.employeeWorkdayId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  });

  it("reports justified-only windows when no check-in candidate exists", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(employeeWorkdayAvailabilityRepository, "listCheckInCandidates", async () => []);
    mock.method(employeeWorkdayAvailabilityRepository, "hasJustifiedWorkdayInRange", async () => true);
    const { operationRepository } = await import("../repositories/operation.repository");
    mock.method(operationRepository, "findCompatibleForEmployee", async () => []);

    const result = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
      companyId,
      employeeId,
      new Date("2026-07-31T12:05:00.000Z"),
    );

    assert.equal(result.candidates.length, 0);
    assert.equal(result.hasJustifiedWorkdayInWindow, true);
  });

  it("diagnoses AFTER_EXPECTED_END from the real candidate without ONE_TIME pollution", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(employeeWorkdayAvailabilityRepository, "listNearbyWorkdayDiagnostics", async () => [
      {
        operationId: "op-today",
        operationKind: "RECURRING",
        operationWorkdayId: "ow-today",
        employeeWorkdayId: "ew-today",
        workDate: "2026-07-31",
        expectedStartAt: "2026-07-31T12:00:00.000Z",
        expectedEndAt: "2026-07-31T20:00:00.000Z",
        expectationStatus: "EXPECTED",
        operationWorkdayStatus: "ACTIVE",
        operationStatus: "SCHEDULED",
        locationActive: true,
        hasAttendance: false,
        priorAttendanceId: null,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
      },
      {
        operationId: "op-old",
        operationKind: "ONE_TIME",
        operationWorkdayId: "ow-old",
        employeeWorkdayId: "ew-old",
        workDate: "2026-07-01",
        expectedStartAt: "2026-07-01T12:00:00.000Z",
        expectedEndAt: "2026-07-01T20:00:00.000Z",
        expectationStatus: "EXPECTED",
        operationWorkdayStatus: "ACTIVE",
        operationStatus: "COMPLETED",
        locationActive: true,
        hasAttendance: true,
        priorAttendanceId: "ar-old",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
      },
    ]);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));

    const diagnosis = await employeeWorkdayAvailabilityService.diagnoseCheckInUnavailability(
      companyId,
      employeeId,
      new Date("2026-07-31T20:00:00.000Z"),
      {
        rawCandidateCount: 0,
        eligibleCandidateCount: 0,
        hasJustifiedWorkdayInWindow: false,
      },
    );

    assert.ok(diagnosis.reasonCodes.includes("AFTER_EXPECTED_END"));
    assert.ok(!diagnosis.reasonCodes.includes("OPERATION_COMPLETED_OR_CANCELLED"));
    const today = diagnosis.candidateEvaluations.find((row) => row.employeeWorkdayId === "ew-today");
    assert.ok(today);
    assert.deepEqual(today?.rejectionReasons, ["AFTER_EXPECTED_END"]);
  });

  it("diagnoses PRIOR_ATTENDANCE with the matching attendance id", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(employeeWorkdayAvailabilityRepository, "listNearbyWorkdayDiagnostics", async () => [
      {
        operationId: "op-today",
        operationKind: "RECURRING",
        operationWorkdayId: "ow-today",
        employeeWorkdayId: "ew-today",
        workDate: "2026-07-31",
        expectedStartAt: "2026-07-31T12:00:00.000Z",
        expectedEndAt: "2026-07-31T20:00:00.000Z",
        expectationStatus: "EXPECTED",
        operationWorkdayStatus: "ACTIVE",
        operationStatus: "SCHEDULED",
        locationActive: true,
        hasAttendance: true,
        priorAttendanceId: "ar-today",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
      },
    ]);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));

    const diagnosis = await employeeWorkdayAvailabilityService.diagnoseCheckInUnavailability(
      companyId,
      employeeId,
      new Date("2026-07-31T14:41:51.000Z"),
      {
        rawCandidateCount: 0,
        eligibleCandidateCount: 0,
        hasJustifiedWorkdayInWindow: false,
      },
    );

    assert.ok(diagnosis.reasonCodes.includes("PRIOR_ATTENDANCE"));
    assert.equal(diagnosis.candidateEvaluations[0]?.priorAttendanceId, "ar-today");
  });
});
