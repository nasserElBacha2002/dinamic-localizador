/**
 * Flow-level characterization: processLocationCheckout / dry-run hydration
 * must consume the Phase 4C helpers without mocking them.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import type { BotRuntimeSettings } from "../../types/bot-runtime-settings";
import type { BotSession } from "../../types/twilio.types";
import type { EmployeeWorkdayCheckoutCandidate } from "../../types/employee-workday-availability";
import type { AttendanceRecord } from "../../types/domain";
import { runWithBotRuntimeSettings } from "../../utils/bot-runtime-settings-scope";
import {
  getRoutingResult,
  runWithRoutingResultScope,
} from "../../utils/whatsapp-routing-result";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import type { CheckoutWriteFields } from "../employee-workday-checkout.command";

const companyId = "00000000-0000-4000-8000-0000000000c1";
const employeeId = "00000000-0000-4000-8000-0000000000c2";
const operationId = "00000000-0000-4000-8000-0000000000c3";
const employeeWorkdayId = "00000000-0000-4000-8000-0000000000c4";
const attendanceRecordId = "00000000-0000-4000-8000-0000000000c5";
const sessionId = "00000000-0000-4000-8000-0000000000c9";

const runtimeSettings = (overrides: Partial<BotRuntimeSettings> = {}): BotRuntimeSettings => ({
  companyId,
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  geofenceReviewMarginMeters: 30,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  pendingOperationExpirationHours: 12,
  sessionTtlMinutes: 15,
  ...overrides,
});

const checkoutCandidate = (
  overrides: Partial<EmployeeWorkdayCheckoutCandidate> = {},
): EmployeeWorkdayCheckoutCandidate => ({
  employeeWorkdayId,
  operationWorkdayId: "00000000-0000-4000-8000-0000000000c6",
  operationId,
  serviceId: "00000000-0000-4000-8000-0000000000c7",
  serviceName: "Servicio Centro",
  serviceAddress: "Av. Corrientes 1234",
  serviceLocality: "CABA",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  allowedRadiusMeters: 150,
  operationKind: "ONE_TIME",
  workDate: "2026-07-05",
  expectedStartAt: "2026-07-05T15:00:00.000Z",
  expectedEndAt: "2026-07-05T21:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 30,
  scheduleTimezone: "America/Argentina/Buenos_Aires",
  attendanceRecordId,
  checkInAt: "2026-07-05T15:00:00.000Z",
  checkoutWithoutArrival: false,
  expectationStatus: "EXPECTED",
  absenceRequestId: null,
  operationAssignmentId: null,
  ...overrides,
});

const buildSession = (overrides: Partial<BotSession> = {}): BotSession => ({
  id: sessionId,
  companyId,
  employeeId,
  operationId,
  employeeWorkdayId,
  attendanceRecordId,
  phoneNumber: "+5491111111111",
  state: "WAITING_CHECKOUT_LOCATION",
  contextJson: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-07-05T15:00:00.000Z",
  updatedAt: "2026-07-05T15:00:00.000Z",
  ...overrides,
});

const openAttendance = (): AttendanceRecord => ({
  id: attendanceRecordId,
  operationId,
  employeeId,
  employeeWorkdayId,
  receivedLatitude: -34.6,
  receivedLongitude: -58.4,
  distanceMeters: 10,
  validationStatus: "VALID",
  locationStatus: "INSIDE_GEOFENCE",
  punctualityStatus: "ON_TIME",
  sourceMessageSid: "SM-IN",
  validationReason: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  receivedAt: "2026-07-05T15:00:00.000Z",
  checkoutAt: null,
  checkoutLatitude: null,
  checkoutLongitude: null,
  checkoutDistanceMeters: null,
  checkoutStatus: null,
  checkoutReviewReason: null,
  earlyDepartureMinutes: null,
  extraWorkedMinutes: null,
  checkoutMessageSid: null,
  arrivalSource: null,
  checkoutSource: null,
  arrivalRegisteredBy: null,
  arrivalRegisteredAt: null,
  checkoutRegisteredBy: null,
  checkoutRegisteredAt: null,
  isSimulation: false,
  simulationSessionId: null,
  createdAt: "2026-07-05T15:00:00.000Z",
});

/** Persistent mode: durable command path. skipWhatsAppPersistence avoids message DB writes. */
const persistentContext = (simulatedNow: Date) => ({
  simulationSessionId: "sim-flow-char",
  employeeIdOverride: employeeId,
  phoneNumber: "+5491111111111",
  simulatedNow,
  mode: "persistent" as const,
  skipWhatsAppPersistence: true,
  messages: [],
  technicalDetails: {},
  simulationArtifacts: [],
  virtualAttendanceRecords: [],
  lastBotResponse: null,
  lastDetectedIntent: null,
  lastTwilioPayload: null,
});

const dryRunContext = (simulatedNow: Date) => ({
  ...persistentContext(simulatedNow),
  mode: "dry-run" as const,
});

describe("checkout-attendance flow characterization (4C wiring)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("Case A: accepted checkout with arrival → command + CHECKOUT_COMPLETED", async () => {
    setupUnitTestEnv();
    const { processLocationCheckout } = await import("./checkout-attendance.flow");
    const { employeeWorkdayAvailabilityService } = await import(
      "../employee-workday-availability.service"
    );
    const { attendanceRepository } = await import("../../repositories/attendance.repository");
    const { employeeWorkdayCheckoutCommand } = await import("../employee-workday-checkout.command");
    const { botSessionService } = await import("../bot-session.service");
    const { runWithBotRuntimeContext } = await import("../../utils/bot-runtime-context");

    let capturedFields: CheckoutWriteFields | null = null;
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "eligible" as const,
      candidate: checkoutCandidate(),
    }));
    mock.method(attendanceRepository, "findCheckInForEmployeeWorkday", async () => openAttendance());
    mock.method(employeeWorkdayCheckoutCommand, "registerCheckoutWithLocation", async (input) => {
      capturedFields = input.fields;
      return {
        ...openAttendance(),
        checkoutAt: input.fields.checkoutAt,
        checkoutStatus: input.fields.checkoutStatus,
        checkoutDistanceMeters: input.fields.checkoutDistanceMeters,
        checkoutLatitude: input.fields.checkoutLatitude,
        checkoutLongitude: input.fields.checkoutLongitude,
      };
    });
    mock.method(botSessionService, "completeSession", async () => undefined);

    const routing = await runWithRoutingResultScope(async () => {
      await runWithBotRuntimeContext(
        persistentContext(new Date("2026-07-05T21:05:00.000Z")),
        async () =>
          runWithBotRuntimeSettings(runtimeSettings(), async () =>
            processLocationCheckout({
              companyId,
              session: buildSession(),
              employeeId,
              employeeWorkdayId,
              attendanceRecordId,
              operationId,
              latitude: -34.6,
              longitude: -58.4,
              messageSid: "SM-FLOW-A",
              phoneFrom: "+5491111111111",
              phoneTo: "+5491000000000",
            }),
          ),
      );
      return getRoutingResult();
    });

    assert.ok(capturedFields);
    assert.notEqual(capturedFields!.checkoutStatus, "CHECKOUT_REJECTED");
    assert.equal(routing?.resultCode, WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED);
    assert.equal(routing?.flowType, "CHECKOUT");
  });

  it("Case B: CHECKOUT_REJECTED → LOCATION_OUTSIDE_ALLOWED_RADIUS", async () => {
    setupUnitTestEnv();
    const { processLocationCheckout } = await import("./checkout-attendance.flow");
    const { employeeWorkdayAvailabilityService } = await import(
      "../employee-workday-availability.service"
    );
    const { attendanceRepository } = await import("../../repositories/attendance.repository");
    const { employeeWorkdayCheckoutCommand } = await import("../employee-workday-checkout.command");
    const { botSessionService } = await import("../bot-session.service");
    const { runWithBotRuntimeContext } = await import("../../utils/bot-runtime-context");

    let capturedFields: CheckoutWriteFields | null = null;
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "eligible" as const,
      candidate: checkoutCandidate(),
    }));
    mock.method(attendanceRepository, "findCheckInForEmployeeWorkday", async () => openAttendance());
    mock.method(employeeWorkdayCheckoutCommand, "registerCheckoutWithLocation", async (input) => {
      capturedFields = input.fields;
      return {
        ...openAttendance(),
        checkoutAt: input.fields.checkoutAt,
        checkoutStatus: input.fields.checkoutStatus,
        checkoutDistanceMeters: input.fields.checkoutDistanceMeters,
        checkoutLatitude: input.fields.checkoutLatitude,
        checkoutLongitude: input.fields.checkoutLongitude,
      };
    });
    mock.method(botSessionService, "completeSession", async () => undefined);

    const routing = await runWithRoutingResultScope(async () => {
      await runWithBotRuntimeContext(
        persistentContext(new Date("2026-07-05T21:05:00.000Z")),
        async () =>
          runWithBotRuntimeSettings(runtimeSettings(), async () =>
            processLocationCheckout({
              companyId,
              session: buildSession(),
              employeeId,
              employeeWorkdayId,
              attendanceRecordId,
              operationId,
              // Far from store → outside radius + review margin → REJECTED
              latitude: -34.0,
              longitude: -58.4,
              messageSid: "SM-FLOW-B",
              phoneFrom: "+5491111111111",
              phoneTo: "+5491000000000",
            }),
          ),
      );
      return getRoutingResult();
    });

    assert.equal(capturedFields?.checkoutStatus, "CHECKOUT_REJECTED");
    assert.equal(routing?.resultCode, WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS);
  });

  it("Case C: exit without arrival (accepted) → CHECKOUT_WITHOUT_ARRIVAL", async () => {
    setupUnitTestEnv();
    const { processLocationCheckout } = await import("./checkout-attendance.flow");
    const { employeeWorkdayAvailabilityService } = await import(
      "../employee-workday-availability.service"
    );
    const { employeeWorkdayCheckoutCommand } = await import("../employee-workday-checkout.command");
    const { botSessionService } = await import("../bot-session.service");
    const { runWithBotRuntimeContext } = await import("../../utils/bot-runtime-context");

    let registerCalls = 0;
    mock.method(
      employeeWorkdayAvailabilityService,
      "revalidateExitWithoutArrivalCandidate",
      async () => ({
        kind: "eligible" as const,
        candidate: checkoutCandidate({
          attendanceRecordId: null,
          checkInAt: null,
          checkoutWithoutArrival: true,
        }),
      }),
    );
    mock.method(employeeWorkdayCheckoutCommand, "registerExitWithoutArrival", async (input) => {
      registerCalls += 1;
      assert.notEqual(input.fields.checkoutStatus, "CHECKOUT_REJECTED");
      return {
        ...openAttendance(),
        id: "created-exit-without-arrival",
        checkoutAt: input.fields.checkoutAt,
        checkoutStatus: input.fields.checkoutStatus,
        checkoutDistanceMeters: input.fields.checkoutDistanceMeters,
        checkoutLatitude: input.fields.checkoutLatitude,
        checkoutLongitude: input.fields.checkoutLongitude,
      };
    });
    mock.method(botSessionService, "completeSession", async () => undefined);

    const routing = await runWithRoutingResultScope(async () => {
      await runWithBotRuntimeContext(
        persistentContext(new Date("2026-07-05T21:05:00.000Z")),
        async () =>
          runWithBotRuntimeSettings(runtimeSettings(), async () =>
            processLocationCheckout({
              companyId,
              session: buildSession({
                attendanceRecordId: null,
              }),
              employeeId,
              employeeWorkdayId,
              attendanceRecordId: null,
              operationId,
              latitude: -34.6,
              longitude: -58.4,
              messageSid: "SM-FLOW-C",
              phoneFrom: "+5491111111111",
              phoneTo: "+5491000000000",
              checkoutWithoutArrival: true,
            }),
          ),
      );
      return getRoutingResult();
    });

    assert.equal(registerCalls, 1);
    assert.equal(routing?.resultCode, WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL);
  });

  it("Case D: dry-run location checkout hydrates virtual attendance through the flow", async () => {
    setupUnitTestEnv();
    const { processLocationCheckout } = await import("./checkout-attendance.flow");
    const { employeeWorkdayAvailabilityService } = await import(
      "../employee-workday-availability.service"
    );
    const { employeeWorkdayCheckoutCommand } = await import("../employee-workday-checkout.command");
    const { botSessionService } = await import("../bot-session.service");
    const { runWithBotRuntimeContext, addVirtualCheckIn } = await import(
      "../../utils/bot-runtime-context"
    );

    let durableCalls = 0;
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "eligible" as const,
      candidate: checkoutCandidate(),
    }));
    mock.method(employeeWorkdayCheckoutCommand, "registerCheckoutWithLocation", async () => {
      durableCalls += 1;
      throw new Error("durable checkout must not run in dry-run");
    });
    mock.method(botSessionService, "completeSession", async () => undefined);

    const ctx = dryRunContext(new Date("2026-07-05T21:05:00.000Z"));

    await runWithBotRuntimeContext(ctx, async () => {
      addVirtualCheckIn({
        operationId,
        employeeId,
        employeeWorkdayId,
        receivedAt: "2026-07-05T15:00:00.000Z",
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        distanceMeters: 42,
      });

      await runWithBotRuntimeSettings(runtimeSettings(), async () =>
        processLocationCheckout({
          companyId,
          session: buildSession(),
          employeeId,
          employeeWorkdayId,
          attendanceRecordId,
          operationId,
          latitude: -34.601,
          longitude: -58.401,
          messageSid: "SM-FLOW-D",
          phoneFrom: "+5491111111111",
          phoneTo: "+5491000000000",
        }),
      );
    });

    assert.equal(durableCalls, 0);
    assert.equal(ctx.simulationArtifacts.length, 1);
    const artifact = ctx.simulationArtifacts[0];
    assert.equal(artifact.type, "check-out");
    assert.equal(artifact.persisted, false);
    assert.equal(artifact.employeeWorkdayId, employeeWorkdayId);
    assert.ok(typeof artifact.virtualAttendanceId === "string");
    assert.ok(typeof artifact.distanceMeters === "number");

    const virtual = ctx.virtualAttendanceRecords[0];
    assert.ok(virtual);
    assert.equal(virtual.distanceMeters, 42);
    assert.equal(virtual.validationStatus, "VALID");
    assert.equal(virtual.locationStatus, "INSIDE_GEOFENCE");
    assert.equal(virtual.punctualityStatus, "ON_TIME");
    assert.ok(virtual.checkoutAt);
    assert.equal(ctx.simulationSessionId, "sim-flow-char");
    assert.ok(ctx.technicalDetails.checkoutValidation);
  });
});
