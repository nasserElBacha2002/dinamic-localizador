import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import type { BotSession } from "../types/twilio.types";
import type { EmployeeWorkdayCheckoutCandidate } from "../types/employee-workday-availability";
import { runWithBotRuntimeSettings } from "../utils/bot-runtime-settings-scope";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import {
  NO_CHECKOUT_OPERATION_MESSAGE,
  PENDING_CHECKOUT_EXPIRED_MESSAGE,
} from "./bot/bot-response.builder";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";
const employeeWorkdayId = "00000000-0000-4000-8000-000000000004";
const attendanceRecordId = "00000000-0000-4000-8000-000000000005";
const sessionId = "00000000-0000-4000-8000-000000000099";

const runtimeSettings = (overrides: Partial<BotRuntimeSettings> = {}): BotRuntimeSettings => ({
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
  ...overrides,
});

const checkoutCandidate = (
  overrides: Partial<EmployeeWorkdayCheckoutCandidate> = {},
): EmployeeWorkdayCheckoutCandidate => ({
  employeeWorkdayId,
  operationWorkdayId: "00000000-0000-4000-8000-000000000006",
  operationId,
  serviceId: "00000000-0000-4000-8000-000000000007",
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

const simulationContext = (simulatedNow: Date) => ({
  simulationSessionId: "sim-checkout-expiration",
  employeeIdOverride: employeeId,
  phoneNumber: "+5491111111111",
  simulatedNow,
  mode: "dry-run" as const,
  skipWhatsAppPersistence: true,
  messages: [],
  technicalDetails: {},
  simulationArtifacts: [],
  virtualAttendanceRecords: [],
  lastBotResponse: null,
  lastDetectedIntent: null,
  lastTwilioPayload: null,
});

describe("whatsapp pending checkout expiration flows", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects checkout location when pending checkout expired while session was open", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    let registerCalls = 0;
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "expired" as const,
    }));
    mock.method(attendanceRepository, "registerCheckoutInTransaction", async () => {
      registerCalls += 1;
      throw new Error("registerCheckoutInTransaction must not be called");
    });

    const twiml = await runWithBotRuntimeContext(
      simulationContext(new Date("2026-07-06T10:00:00.000Z")),
      async () =>
        runWithBotRuntimeSettings(runtimeSettings(), async () =>
          whatsappBotService.processLocationCheckout({
            companyId,
            session: buildSession(),
            employeeId,
            employeeWorkdayId,
            attendanceRecordId,
            operationId,
            latitude: -34.6,
            longitude: -58.4,
            messageSid: "SM-LOC-EXPIRED",
            phoneFrom: "+5491111111111",
            phoneTo: "+5491000000000",
          }),
        ),
    );

    assert.match(twiml, new RegExp(PENDING_CHECKOUT_EXPIRED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(registerCalls, 0);
  });

  it("uses generic unavailable message when open checkout attendance is gone", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    let registerCalls = 0;
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "not_available" as const,
    }));
    mock.method(attendanceRepository, "registerCheckoutInTransaction", async () => {
      registerCalls += 1;
      throw new Error("registerCheckoutInTransaction must not be called");
    });

    const twiml = await runWithBotRuntimeContext(
      simulationContext(new Date("2026-07-05T21:05:00.000Z")),
      async () =>
        runWithBotRuntimeSettings(runtimeSettings(), async () =>
          whatsappBotService.processLocationCheckout({
            companyId,
            session: buildSession(),
            employeeId,
            employeeWorkdayId,
            attendanceRecordId,
            operationId,
            latitude: -34.6,
            longitude: -58.4,
            messageSid: "SM-LOC-GONE",
            phoneFrom: "+5491111111111",
            phoneTo: "+5491000000000",
          }),
        ),
    );

    assert.match(twiml, new RegExp(NO_CHECKOUT_OPERATION_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(
      twiml,
      new RegExp(PENDING_CHECKOUT_EXPIRED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    assert.equal(registerCalls, 0);
  });

  it("revalidates stored checkout option when numeric selection arrives after expiration", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { botSessionService } = await import("./bot-session.service");
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    let waitingLocationCalls = 0;
    let registerCalls = 0;
    let withoutLocationCalls = 0;

    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "expired" as const,
    }));
    mock.method(botSessionService, "selectCheckoutOperationAndRenewExpiration", async () => {
      waitingLocationCalls += 1;
      return { kind: "ok" as const };
    });
    mock.method(botSessionService, "createWaitingCheckoutLocationSession", async () => {
      waitingLocationCalls += 1;
    });
    mock.method(attendanceRepository, "registerCheckoutInTransaction", async () => {
      registerCalls += 1;
      throw new Error("registerCheckoutInTransaction must not be called");
    });
    mock.method(whatsappBotService, "processCheckoutWithoutLocation", async () => {
      withoutLocationCalls += 1;
      return "<Response><Message>should-not-run</Message></Response>";
    });

    const candidate = checkoutCandidate();
    const session = buildSession({
      state: "WAITING_CHECKOUT_OPERATION_SELECTION",
      operationId: null,
      employeeWorkdayId: null,
      attendanceRecordId: null,
      contextJson: JSON.stringify({
        workdayOptions: [
          {
            employeeWorkdayId: candidate.employeeWorkdayId,
            operationWorkdayId: candidate.operationWorkdayId,
            operationId: candidate.operationId,
            attendanceRecordId: candidate.attendanceRecordId,
            serviceName: candidate.serviceName,
            serviceAddress: candidate.serviceAddress,
            serviceLocality: candidate.serviceLocality,
            expectedStartAt: candidate.expectedStartAt,
            expectedEndAt: candidate.expectedEndAt,
            workDate: candidate.workDate,
            checkInAt: candidate.checkInAt,
          },
        ],
      }),
    });

    const twiml = await runWithBotRuntimeContext(
      simulationContext(new Date("2026-07-06T10:00:00.000Z")),
      async () =>
        runWithBotRuntimeSettings(runtimeSettings(), async () =>
          whatsappBotService.handleCheckoutOperationSelection({
            companyId,
            session,
            body: "1",
            employeeId,
            phoneFrom: "+5491111111111",
            phoneTo: "+5491000000000",
            messageSid: "SM-SELECT-EXPIRED",
          }),
        ),
    );

    assert.match(twiml, new RegExp(PENDING_CHECKOUT_EXPIRED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(waitingLocationCalls, 0);
    assert.equal(withoutLocationCalls, 0);
    assert.equal(registerCalls, 0);
  });

  it("rejects expired checkout when checkout location is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { botSessionService } = await import("./bot-session.service");
    const { runWithBotRuntimeContext, addVirtualCheckIn } = await import(
      "../utils/bot-runtime-context"
    );

    let registerCalls = 0;
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "expired" as const,
    }));
    mock.method(attendanceRepository, "registerCheckoutInTransaction", async () => {
      registerCalls += 1;
      throw new Error("registerCheckoutInTransaction must not be called");
    });
    mock.method(botSessionService, "completeSession", async () => undefined);

    const twiml = await runWithBotRuntimeContext(
      simulationContext(new Date("2026-07-06T10:00:00.000Z")),
      async () => {
        addVirtualCheckIn({
          operationId,
          employeeId,
          employeeWorkdayId,
          receivedAt: "2026-07-05T15:00:00.000Z",
          validationStatus: "VALID",
          locationStatus: "INSIDE_GEOFENCE",
          punctualityStatus: "ON_TIME",
          distanceMeters: 10,
        });

        return runWithBotRuntimeSettings(
          runtimeSettings({ requireCheckoutLocation: false }),
          async () =>
            whatsappBotService.processCheckoutWithoutLocation({
              companyId,
              employeeId,
              employeeWorkdayId,
              attendanceRecordId,
              operationId,
              phoneFrom: "+5491111111111",
              phoneTo: "+5491000000000",
              messageSid: "SM-NOLOC-EXPIRED",
              sessionId,
            }),
        );
      },
    );

    assert.match(twiml, new RegExp(PENDING_CHECKOUT_EXPIRED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(registerCalls, 0);
  });
});
