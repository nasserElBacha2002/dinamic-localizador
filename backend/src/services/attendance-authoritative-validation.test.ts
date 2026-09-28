import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const companyId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const serviceId = "44444444-4444-4444-8444-444444444444";
const employeeWorkdayId = "55555555-5555-4555-8555-555555555555";
const operationWorkdayId = "66666666-6666-4666-8666-666666666666";

describe("attendanceService.create authoritative validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  async function loadWithMocks(options?: {
    serviceLat?: number;
    serviceLon?: number;
    radius?: number;
    margin?: number;
    expectedStart?: string;
    now?: Date;
  }) {
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { workdayMaterializationService } = await import("./workday-materialization.service");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");
    const clock = await import("../utils/attendance-authoritative-clock");
    const { attendanceService } = await import("./attendance.service");

    const serviceLat = options?.serviceLat ?? -34.6037;
    const serviceLon = options?.serviceLon ?? -58.3816;
    const radius = options?.radius ?? 150;
    const margin = options?.margin ?? 30;
    const farLat = serviceLat + 0.0045;
    const farLon = serviceLon;
    const now = options?.now ?? new Date("2026-09-21T12:05:00.000Z");

    mock.method(clock.attendanceAuthoritativeClock, "now", () => new Date(now.getTime()));

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      serviceId,
      operationKind: "ONE_TIME",
      scheduleMode: "SINGLE",
      scheduledStart: options?.expectedStart ?? "2026-09-21T12:00:00.000Z",
      scheduledEnd: "2026-09-21T20:00:00.000Z",
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      earlyToleranceSource: "COMPANY_DEFAULT",
      lateToleranceSource: "COMPANY_DEFAULT",
      status: "IN_PROGRESS",
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      companyId,
      fullName: "Test",
      phoneNumber: "+5491100000000",
      active: true,
    }));
    mock.method(serviceRepository, "findById", async () => ({
      id: serviceId,
      name: "Store",
      address: null,
      neighborhood: null,
      locality: null,
      locationZoneId: null,
      serviceFormat: null,
      latitude: serviceLat,
      longitude: serviceLon,
      allowedRadiusMeters: radius,
      googlePlaceId: null,
      active: true,
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    }));
    mock.method(workdayMaterializationService, "ensureOperationWorkday", async () => ({
      id: operationWorkdayId,
      companyId,
      operationId,
      workDate: "2026-09-21",
      operationShiftId: null,
      operationShiftVersionId: null,
      shiftCodeSnapshot: null,
      shiftNameSnapshot: null,
      expectedStartAt: options?.expectedStart ?? "2026-09-21T12:00:00.000Z",
      expectedEndAt: "2026-09-21T20:00:00.000Z",
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      scheduleVersion: 1,
      scheduleSourceSnapshot: "COMPANY",
      scheduleTimezoneSnapshot: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      cancellationReason: null,
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    }));
    mock.method(operationEmployeeRepository, "exists", async () => true);
    mock.method(workdayMaterializationService, "ensureEmployeeWorkday", async () => ({
      id: employeeWorkdayId,
      companyId,
      operationWorkdayId,
      operationAssignmentId: null,
      employeeId,
      expectationStatus: "EXPECTED",
      cancellationReason: null,
      absenceRequestId: null,
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    }));
    mock.method(attendanceRepository, "hasActiveRecordByEmployeeWorkday", async () => false);
    mock.method(geofencePolicyResolver, "resolveForService", async () => ({
      companyId,
      radiusMeters: radius,
      marginMeters: margin,
      radiusSource: "service" as const,
      marginSource: "company_settings" as const,
    }));

    let persisted: Record<string, unknown> | null = null;
    mock.method(attendanceRepository, "create", async (_cid: string, input: Record<string, unknown>) => {
      persisted = input;
      return { id: "att-1", ...input };
    });

    return {
      attendanceService,
      farLat,
      farLon,
      serviceLat,
      serviceLon,
      getPersisted: () => persisted,
      now,
    };
  }

  it("ignores client VALID/INSIDE/distance and persists server OUTSIDE/REJECTED for far coords", async () => {
    const { attendanceService, farLat, farLon, getPersisted } = await loadWithMocks();
    const { createAttendanceSchema } = await import("../schemas/attendance.schema");

    const parsed = createAttendanceSchema.parse({
      operationId,
      employeeId,
      receivedLatitude: farLat,
      receivedLongitude: farLon,
      receivedAt: "2026-09-21T12:05:00.000Z",
      distanceMeters: 1,
      validationStatus: "VALID",
      locationStatus: "INSIDE_GEOFENCE",
      punctualityStatus: "ON_TIME",
    });

    await attendanceService.create(companyId, parsed);

    const persisted = getPersisted();
    assert.ok(persisted);
    assert.equal(persisted.validationStatus, "REJECTED");
    assert.equal(persisted.locationStatus, "OUTSIDE_GEOFENCE");
    assert.ok(Number(persisted.distanceMeters) > 400);
  });

  it("accepts old-client legacy payload during compatibility window but strips derived fields", async () => {
    const { createAttendanceSchema } = await import("../schemas/attendance.schema");
    const parsed = createAttendanceSchema.parse({
      operationId,
      employeeId,
      receivedLatitude: -34.6037,
      receivedLongitude: -58.3816,
      receivedAt: "2026-09-21T12:05:00.000Z",
      distanceMeters: 1,
      validationStatus: "VALID",
      locationStatus: "INSIDE_GEOFENCE",
      punctualityStatus: "ON_TIME",
      validationReason: "client lie",
    });

    assert.equal("distanceMeters" in parsed, false);
    assert.equal("validationStatus" in parsed, false);
    assert.equal("locationStatus" in parsed, false);
    assert.equal("punctualityStatus" in parsed, false);
  });

  it("classifies punctuality from server clock, ignoring manipulated client receivedAt", async () => {
    const { attendanceService, serviceLat, serviceLon, getPersisted, now } = await loadWithMocks({
      expectedStart: "2026-09-21T12:00:00.000Z",
      now: new Date("2026-09-21T12:45:00.000Z"),
    });

    await attendanceService.create(companyId, {
      operationId,
      employeeId,
      receivedLatitude: serviceLat,
      receivedLongitude: serviceLon,
      receivedAt: "2026-09-21T12:05:00.000Z",
    });

    const persisted = getPersisted();
    assert.ok(persisted);
    assert.equal(persisted.punctualityStatus, "OUTSIDE_TIME_WINDOW");
    assert.equal(persisted.validationStatus, "REJECTED");
    assert.equal(persisted.locationStatus, "INSIDE_GEOFENCE");
    assert.equal(persisted.receivedAt, now.toISOString());
  });

  it("persists INSIDE/VALID when location is inside and server time is within window", async () => {
    const { attendanceService, serviceLat, serviceLon, getPersisted } = await loadWithMocks({
      now: new Date("2026-09-21T12:00:00.000Z"),
    });

    await attendanceService.create(companyId, {
      operationId,
      employeeId,
      receivedLatitude: serviceLat,
      receivedLongitude: serviceLon,
      receivedAt: "2020-01-01T00:00:00.000Z",
    });

    const persisted = getPersisted();
    assert.ok(persisted);
    assert.equal(persisted.locationStatus, "INSIDE_GEOFENCE");
    assert.equal(persisted.punctualityStatus, "ON_TIME");
    assert.equal(persisted.validationStatus, "VALID");
  });
});
