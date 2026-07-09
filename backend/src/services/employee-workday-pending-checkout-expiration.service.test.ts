import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { EmployeeWorkdayCheckoutCandidate } from "../types/employee-workday-availability";

const baseCandidate = (
  overrides: Partial<EmployeeWorkdayCheckoutCandidate> = {},
): EmployeeWorkdayCheckoutCandidate => ({
  employeeWorkdayId: "ew-1",
  operationWorkdayId: "ow-1",
  operationId: "op-1",
  serviceId: "svc-1",
  serviceName: "Servicio A",
  serviceAddress: null,
  serviceLocality: null,
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  allowedRadiusMeters: 150,
  operationKind: "ONE_TIME",
  workDate: "2026-07-07",
  expectedStartAt: "2026-07-06T23:30:00.000Z",
  expectedEndAt: "2026-07-07T03:00:00.000Z",
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 90,
  scheduleTimezone: "America/Argentina/Buenos_Aires",
  attendanceRecordId: "ar-1",
  checkInAt: "2026-07-06T23:45:00.000Z",
  ...overrides,
});

describe("employeeWorkdayAvailabilityService pending checkout expiration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("filters listOpenForCheckout by expiration hours (A/B/C/E)", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    const stillValid = baseCandidate({
      attendanceRecordId: "ar-valid",
      expectedEndAt: "2026-07-07T03:00:00.000Z",
    });
    const expiredOld = baseCandidate({
      attendanceRecordId: "ar-expired",
      expectedEndAt: "2026-07-07T03:00:00.000Z",
      employeeWorkdayId: "ew-expired",
    });
    const currentOpen = baseCandidate({
      attendanceRecordId: "ar-current",
      expectedEndAt: "2026-07-07T10:00:00.000Z",
      employeeWorkdayId: "ew-current",
      checkInAt: "2026-07-07T09:00:00.000Z",
    });

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listCheckoutCandidates",
      async (
        _companyId: string,
        _employeeId: string,
        input: { now: Date; pendingOperationExpirationHours: number },
      ) => {
        assert.equal(input.pendingOperationExpirationHours, 12);
        return [stillValid];
      },
    );

    const listed = await employeeWorkdayAvailabilityService.listOpenForCheckout(
      "company-1",
      "employee-1",
      new Date("2026-07-07T08:00:00.000Z"),
      { pendingOperationExpirationHours: 12 },
    );
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.attendanceRecordId, "ar-valid");

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listCheckoutCandidates",
      async () => [expiredOld, currentOpen],
    );

    const mixed = await employeeWorkdayAvailabilityService.listOpenForCheckout(
      "company-1",
      "employee-1",
      new Date("2026-07-07T16:00:00.000Z"),
      { pendingOperationExpirationHours: 12 },
    );
    assert.equal(mixed.length, 1);
    assert.equal(mixed[0]?.attendanceRecordId, "ar-current");

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listCheckoutCandidates",
      async () => [expiredOld],
    );
    const customWindow = await employeeWorkdayAvailabilityService.listOpenForCheckout(
      "company-1",
      "employee-1",
      new Date("2026-07-07T16:00:00.000Z"),
      { pendingOperationExpirationHours: 24 },
    );
    assert.equal(customWindow.length, 1);
    assert.equal(customWindow[0]?.attendanceRecordId, "ar-expired");
  });

  it("revalidateCheckoutCandidate rejects an expired checkout candidate", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    const candidate = baseCandidate({
      expectedEndAt: "2026-07-07T03:00:00.000Z",
    });

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "findOpenCheckoutAttendanceContext",
      async () => candidate,
    );
    mock.method(
      employeeWorkdayAvailabilityRepository,
      "findCheckoutCandidateByAttendanceId",
      async (
        _companyId: string,
        _employeeId: string,
        _attendanceId: string,
        input: { now: Date; pendingOperationExpirationHours: number },
      ) => {
        const expirationMs =
          new Date(candidate.expectedEndAt!).getTime() +
          input.pendingOperationExpirationHours * 60 * 60 * 1000;
        if (input.now.getTime() > expirationMs) {
          return null;
        }
        return candidate;
      },
    );

    const atBoundary = new Date("2026-07-07T15:00:00.000Z");
    const ok = await employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
      "company-1",
      "employee-1",
      "ar-1",
      atBoundary,
      { pendingOperationExpirationHours: 12 },
    );
    assert.equal(ok.kind, "eligible");

    const expired = await employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
      "company-1",
      "employee-1",
      "ar-1",
      new Date(atBoundary.getTime() + 1),
      { pendingOperationExpirationHours: 12 },
    );
    assert.equal(expired.kind, "expired");
  });

  it("revalidateCheckoutCandidate returns not_available when open attendance is gone", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "findOpenCheckoutAttendanceContext",
      async () => null,
    );

    const result = await employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
      "company-1",
      "employee-1",
      "ar-1",
      new Date("2026-07-07T08:00:00.000Z"),
      { pendingOperationExpirationHours: 12 },
    );
    assert.equal(result.kind, "not_available");
  });

  it("company isolation uses per-call expiration hours", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    const candidate = baseCandidate({
      expectedEndAt: "2026-07-07T03:00:00.000Z",
    });
    const now = new Date("2026-07-07T16:00:00.000Z");

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "findOpenCheckoutAttendanceContext",
      async () => candidate,
    );
    mock.method(
      employeeWorkdayAvailabilityRepository,
      "findCheckoutCandidateByAttendanceId",
      async (
        _companyId: string,
        _employeeId: string,
        _attendanceId: string,
        input: { now: Date; pendingOperationExpirationHours: number },
      ) => {
        const expirationMs =
          new Date(candidate.expectedEndAt!).getTime() +
          input.pendingOperationExpirationHours * 60 * 60 * 1000;
        return input.now.getTime() <= expirationMs ? candidate : null;
      },
    );

    const companyA = await employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
      "company-a",
      "employee-1",
      "ar-1",
      now,
      { pendingOperationExpirationHours: 12 },
    );
    const companyB = await employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
      "company-b",
      "employee-1",
      "ar-1",
      now,
      { pendingOperationExpirationHours: 24 },
    );

    assert.equal(companyA.kind, "expired");
    assert.equal(companyB.kind, "eligible");
  });

  it("service filter does not mutate candidate historical fields", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    const candidate = baseCandidate({
      expectedEndAt: "2026-07-06T03:00:00.000Z",
      checkInAt: "2026-07-05T23:45:00.000Z",
    });

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listCheckoutCandidates",
      async () => [candidate],
    );

    const listed = await employeeWorkdayAvailabilityService.listOpenForCheckout(
      "company-1",
      "employee-1",
      new Date("2026-07-07T16:00:00.000Z"),
      { pendingOperationExpirationHours: 12 },
    );
    assert.equal(listed.length, 0);
    assert.equal(candidate.checkInAt, "2026-07-05T23:45:00.000Z");
    assert.equal(candidate.attendanceRecordId, "ar-1");
  });
});
