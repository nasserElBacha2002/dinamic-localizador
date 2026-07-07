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
  workDate: "2026-07-07",
  expectedStartAt: "2026-07-07T12:00:00.000Z",
  expectedEndAt: "2026-07-07T21:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 20,
  scheduleTimezone: "America/Argentina/Buenos_Aires",
  ...overrides,
});

describe("employeeWorkdayAvailabilityService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("excludes candidates outside the check-in window", async () => {
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

    const at = new Date("2026-07-07T12:25:00.000Z");
    const result = await employeeWorkdayAvailabilityService.listAvailableForCheckIn(
      companyId,
      employeeId,
      at,
    );

    assert.equal(result.candidates.length, 0);
    assert.equal(result.hasJustifiedWorkdayInWindow, false);
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
        expectedStartAt: "2026-07-07T12:30:00.000Z",
      }),
      baseCandidate({
        employeeWorkdayId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        serviceName: "Depósito Norte",
        expectedStartAt: "2026-07-07T12:00:00.000Z",
      }),
    ]);
    mock.method(employeeWorkdayAvailabilityRepository, "hasJustifiedWorkdayInRange", async () => false);
    const { operationRepository } = await import("../repositories/operation.repository");
    mock.method(operationRepository, "findCompatibleForEmployee", async () => []);

    const at = new Date("2026-07-07T12:20:00.000Z");
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
      new Date("2026-07-07T12:05:00.000Z"),
    );

    assert.equal(result.candidates.length, 0);
    assert.equal(result.hasJustifiedWorkdayInWindow, true);
  });
});
