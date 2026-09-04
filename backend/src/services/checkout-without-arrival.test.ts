import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WHATSAPP_RESULT_CODES } from "../constants/whatsapp-observability";
import type { EmployeeWorkdayCheckoutCandidate } from "../types/employee-workday-availability";
import {
  EFFECTIVE_STATE_SQL,
  ON_TIME_WORKDAY_SQL,
  WORKED_MINUTES_SQL,
} from "../utils/employee-workday-statistics-projection";
import { buildAnalyticalProjectionRow } from "../utils/statistics-projection-contract";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { runWithBotRuntimeSettings } from "../utils/bot-runtime-settings-scope";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import {
  buildCheckoutRegisteredMessage,
  NO_CHECKOUT_ASSIGNMENT_MESSAGE,
} from "./bot/bot-response.builder";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";

const runtimeSettings = (): BotRuntimeSettings => ({
  companyId,
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  geofenceReviewMarginMeters: 30,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  pendingOperationExpirationHours: 12,
  sessionTtlMinutes: 15,
});

const exitWithoutArrivalCandidate = (
  overrides: Partial<EmployeeWorkdayCheckoutCandidate> = {},
): EmployeeWorkdayCheckoutCandidate => ({
  employeeWorkdayId: "00000000-0000-4000-8000-000000000010",
  operationWorkdayId: "00000000-0000-4000-8000-000000000011",
  operationId: "00000000-0000-4000-8000-000000000012",
  serviceId: "00000000-0000-4000-8000-000000000013",
  serviceName: "Sucursal Norte",
  serviceAddress: "Calle 1",
  serviceLocality: "CABA",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  allowedRadiusMeters: 150,
  operationKind: "ONE_TIME",
  workDate: "2026-08-31",
  expectedStartAt: "2026-08-31T12:00:00.000Z",
  expectedEndAt: "2026-08-31T21:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 30,
  scheduleTimezone: "America/Argentina/Buenos_Aires",
  expectationStatus: "EXPECTED",
  absenceRequestId: null,
  operationAssignmentId: null,
  attendanceRecordId: null,
  checkInAt: null,
  checkoutWithoutArrival: true,
  ...overrides,
});

describe("checkout without prior arrival", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("migration 108 makes arrival fields nullable and adds NOT_RECORDED", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "..",
        "database",
        "migrations",
        "108_attendance_checkout_without_arrival.sql",
      ),
      "utf8",
    );
    assert.match(migration, /ALTER COLUMN received_at DATETIME2 NULL/);
    assert.match(migration, /N'NOT_RECORDED'/);
    assert.match(migration, /CK_attendance_records_arrival_or_checkout/);
  });

  it("statistics SQL never invents worked minutes or punctuality without received_at", () => {
    assert.match(WORKED_MINUTES_SQL, /ar\.received_at IS NOT NULL/);
    assert.match(ON_TIME_WORKDAY_SQL, /ar\.received_at IS NOT NULL/);
    assert.match(
      EFFECTIVE_STATE_SQL,
      /ar\.validation_status IN \(N'VALID', N'PENDING_REVIEW'\) THEN N'PRESENT'/,
    );
  });

  it("analytical projection: exit-only is PRESENT without ON_TIME or worked minutes", () => {
    const row = buildAnalyticalProjectionRow(
      {
        employeeWorkdayId: "ew-1",
        expectationStatus: "EXPECTED",
        expectedStartAt: "2026-08-31T12:00:00.000Z",
        expectedEndAt: "2026-08-31T21:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 30,
        workDate: "2026-08-31",
        attendanceRecords: [
          {
            id: "att-exit-only",
            validationStatus: "VALID",
            receivedAt: null,
            checkoutAt: new Date("2026-08-31T21:05:00.000Z"),
            punctualityStatus: "NOT_RECORDED",
            extraWorkedMinutes: 0,
            isSimulation: false,
          },
        ],
      },
      new Date("2026-08-31T22:00:00.000Z"),
    );

    assert.equal(row.effectiveState, "PRESENT");
    assert.equal(row.workedMinutes, 0);
    assert.equal(row.isOnTimeWorkday, false);
    assert.equal(row.isLateWorkday, false);
  });

  it("analytical projection: exit-only REJECTED is not PRESENT", () => {
    const row = buildAnalyticalProjectionRow(
      {
        employeeWorkdayId: "ew-1",
        expectationStatus: "EXPECTED",
        expectedStartAt: "2026-08-31T12:00:00.000Z",
        expectedEndAt: "2026-08-31T21:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 30,
        workDate: "2026-08-31",
        attendanceRecords: [
          {
            id: "att-exit-rejected",
            validationStatus: "REJECTED",
            receivedAt: null,
            checkoutAt: new Date("2026-08-31T21:05:00.000Z"),
            punctualityStatus: "NOT_RECORDED",
            extraWorkedMinutes: 0,
            isSimulation: false,
          },
        ],
      },
      new Date("2026-08-31T22:00:00.000Z"),
    );

    assert.equal(row.effectiveState, "ABSENT");
    assert.equal(row.workedMinutes, 0);
    assert.equal(row.isOnTimeWorkday, false);
    assert.equal(row.isLateWorkday, false);
  });

  it("maps exit-only checkoutStatus to validation_status correctly", async () => {
    const { resolveExitOnlyValidationStatus } = await import(
      "./employee-workday-checkout.command"
    );
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_VALID"), "VALID");
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_EARLY_WITHIN_TOLERANCE"), "VALID");
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_LATE_EXTRA_TIME"), "VALID");
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_LOCATION_REVIEW"), "PENDING_REVIEW");
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_EARLY_REVIEW"), "PENDING_REVIEW");
    assert.equal(resolveExitOnlyValidationStatus("CHECKOUT_REJECTED"), "REJECTED");
  });

  it("checkout confirmation message shows Llegada: Sin registrar", () => {
    const message = buildCheckoutRegisteredMessage({
      eligible: exitWithoutArrivalCandidate(),
      checkInAt: null,
      checkoutAt: new Date("2026-08-31T21:03:00.000Z"),
      distanceMeters: 12,
      checkoutStatus: "CHECKOUT_VALID",
      extraWorkedMinutes: 0,
    });
    assert.match(message, /Llegada: Sin registrar/);
    assert.match(message, /Salida:/);
    assert.doesNotMatch(message, /Llegada: \d/);
  });

  it("startCheckout falls back to exit-without-arrival candidates", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { botSessionService } = await import("./bot-session.service");
    const { startCheckout } = await import("./bot/checkout-attendance.flow");
    const { extractMessageFromTwiml } = await import("../utils/twiml-message");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    mock.method(employeeWorkdayAvailabilityService, "listOpenForCheckout", async () => []);
    mock.method(
      employeeWorkdayAvailabilityService,
      "listEligibleForCheckoutWithoutArrival",
      async () => [exitWithoutArrivalCandidate()],
    );
    mock.method(botSessionService, "createWaitingCheckoutLocationSession", async () => ({
      id: "session-1",
    }));

    const twiml = await runWithBotRuntimeContext(
      {
        simulationSessionId: "sim-exit-without-arrival",
        employeeIdOverride: employeeId,
        phoneNumber: "+5491111111111",
        simulatedNow: new Date("2026-08-31T20:00:00.000Z"),
        mode: "dry-run",
        skipWhatsAppPersistence: true,
        messages: [],
        technicalDetails: {},
        simulationArtifacts: [],
        virtualAttendanceRecords: [],
        lastBotResponse: null,
        lastDetectedIntent: null,
        lastTwilioPayload: null,
      },
      async () =>
        runWithBotRuntimeSettings(runtimeSettings(), async () =>
          startCheckout({
            companyId,
            employeeId,
            phoneFrom: "+5491111111111",
            phoneTo: "+5491100000000",
            messageSid: "SM-exit-without-arrival-1",
          }),
        ),
    );

    const message = extractMessageFromTwiml(twiml);
    assert.match(message, /ubicaci[oó]n/i);
    assert.doesNotMatch(message, new RegExp(NO_CHECKOUT_ASSIGNMENT_MESSAGE));
  });

  it("startCheckout without assignment returns NO_OPERATION_ASSIGNED semantics", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { startCheckout } = await import("./bot/checkout-attendance.flow");
    const { extractMessageFromTwiml } = await import("../utils/twiml-message");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    mock.method(employeeWorkdayAvailabilityService, "listOpenForCheckout", async () => []);
    mock.method(
      employeeWorkdayAvailabilityService,
      "listEligibleForCheckoutWithoutArrival",
      async () => [],
    );

    const twiml = await runWithBotRuntimeContext(
      {
        simulationSessionId: "sim-no-assignment",
        employeeIdOverride: employeeId,
        phoneNumber: "+5491111111111",
        simulatedNow: new Date("2026-08-31T20:00:00.000Z"),
        mode: "dry-run",
        skipWhatsAppPersistence: true,
        messages: [],
        technicalDetails: {},
        simulationArtifacts: [],
        virtualAttendanceRecords: [],
        lastBotResponse: null,
        lastDetectedIntent: null,
        lastTwilioPayload: null,
      },
      async () =>
        runWithBotRuntimeSettings(runtimeSettings(), async () =>
          startCheckout({
            companyId,
            employeeId,
            phoneFrom: "+5491111111111",
            phoneTo: "+5491100000000",
            messageSid: "SM-no-assignment",
          }),
        ),
    );

    const message = extractMessageFromTwiml(twiml);
    assert.equal(message, NO_CHECKOUT_ASSIGNMENT_MESSAGE);
  });

  it("sorts exit-without-arrival candidates by expectedStart DESC (O2 over O1)", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayAvailabilityRepository } = await import(
      "../repositories/employee-workday-availability.repository"
    );
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );

    const o1 = exitWithoutArrivalCandidate({
      employeeWorkdayId: "ew-o1",
      expectedStartAt: "2026-08-31T11:00:00.000Z",
      expectedEndAt: "2026-08-31T15:00:00.000Z",
    });
    const o2 = exitWithoutArrivalCandidate({
      employeeWorkdayId: "ew-o2",
      expectedStartAt: "2026-08-31T16:00:00.000Z",
      expectedEndAt: "2026-08-31T21:00:00.000Z",
    });

    mock.method(
      employeeWorkdayAvailabilityRepository,
      "listExitWithoutArrivalCandidates",
      async () => [o1, o2],
    );

    const listed = await employeeWorkdayAvailabilityService.listEligibleForCheckoutWithoutArrival(
      companyId,
      employeeId,
      new Date("2026-08-31T20:00:00.000Z"),
      { pendingOperationExpirationHours: 12 },
    );

    assert.equal(listed[0]?.employeeWorkdayId, "ew-o2");
    assert.equal(listed[1]?.employeeWorkdayId, "ew-o1");
  });

  it("exposes distinct observability result codes", () => {
    assert.equal(WHATSAPP_RESULT_CODES.NO_OPERATION_ASSIGNED, "NO_OPERATION_ASSIGNED");
    assert.equal(WHATSAPP_RESULT_CODES.NO_OPEN_ATTENDANCE, "NO_OPEN_ATTENDANCE");
    assert.equal(WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL, "CHECKOUT_WITHOUT_ARRIVAL");
  });

  it("missing-checkin alert query requires received_at IS NOT NULL", () => {
    const source = readFileSync(
      join(process.cwd(), "src/repositories/admin-alert-context.repository.ts"),
      "utf8",
    );
    assert.match(source, /MISSING_CHECKIN_AFTER_OPERATION/);
    assert.match(source, /ar\.received_at IS NOT NULL/);
  });
});
