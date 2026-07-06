import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import { runWithBotRuntimeSettings } from "../utils/bot-runtime-settings-scope";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";

const runtimeSettings = (overrides: Partial<BotRuntimeSettings> = {}): BotRuntimeSettings => ({
  companyId,
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 50,
  geofenceReviewMarginMeters: 30,
  lateGraceMinutes: 0,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  sessionTtlMinutes: 15,
  ...overrides,
});

const eligibleOperation = {
  id: operationId,
  serviceName: "Servicio Centro",
  scheduledStart: "2026-07-05T15:00:00.000Z",
  scheduledEnd: "2026-07-05T21:00:00.000Z",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  allowedRadiusMeters: 0,
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 30,
};

describe("whatsapp bot runtime settings integration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("loads runtime settings once per handleWebhook call", async () => {
    setupUnitTestEnv();
    let loadCount = 0;
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () => {
      loadCount += 1;
      return runtimeSettings();
    });

    const context = {
      simulationSessionId: "sim-1",
      employeeIdOverride: employeeId,
      phoneNumber: "+5491111111111",
      simulatedNow: new Date("2026-07-05T15:05:00.000Z"),
      mode: "dry-run" as const,
      skipWhatsAppPersistence: true,
      messages: [],
      technicalDetails: {},
      simulationArtifacts: [],
      virtualAttendanceRecords: [],
      lastBotResponse: null,
      lastDetectedIntent: null,
      lastTwilioPayload: null,
    };

    await runWithBotRuntimeContext(context, async () => {
      await whatsappBotService.handleWebhook(
        {
          companyId,
          employeeId,
          phoneNumber: "+5491111111111",
          session: null,
          resolutionSource: "simulation_forced_company",
        },
        {
          MessageSid: "SM123",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+5491000000000",
          Body: "hola",
        },
      );
    });

    assert.equal(loadCount, 1);
  });

  it("marks check-in late when lateGraceMinutes is zero in runtime scope", async () => {
    setupUnitTestEnv();
    const { buildCheckInValidation } = await import("./bot/bot-attendance-runtime");

    const result = buildCheckInValidation({
      employeeLatitude: -34.6,
      employeeLongitude: -58.4,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      serviceAllowedRadiusMeters: 0,
      receivedAt: new Date("2026-07-05T15:01:00.000Z"),
      scheduledStart: new Date("2026-07-05T15:00:00.000Z"),
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      runtimeSettings: runtimeSettings({ lateGraceMinutes: 0 }),
    });

    assert.equal(result.validation.punctualityStatus, "LATE");
    assert.equal(result.effectiveRadiusMeters, 50);
  });

  it("registers checkout without location in dry-run with correct message", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { botSessionService } = await import("./bot-session.service");
    const { runWithBotRuntimeContext, addVirtualCheckIn } = await import("../utils/bot-runtime-context");

    mock.method(attendanceRepository, "findCheckoutEligibleOperations", async () => [eligibleOperation]);
    mock.method(botSessionService, "completeSession", async () => undefined);

    const context = {
      simulationSessionId: "sim-1",
      employeeIdOverride: employeeId,
      phoneNumber: "+5491111111111",
      simulatedNow: new Date("2026-07-05T21:05:00.000Z"),
      mode: "dry-run" as const,
      skipWhatsAppPersistence: true,
      messages: [],
      technicalDetails: {},
      simulationArtifacts: [],
      virtualAttendanceRecords: [],
      lastBotResponse: null,
      lastDetectedIntent: null,
      lastTwilioPayload: null,
    };

    await runWithBotRuntimeContext(context, async () => {
      addVirtualCheckIn({
        operationId,
        employeeId,
        receivedAt: "2026-07-05T15:00:00.000Z",
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        distanceMeters: 10,
      });

      await runWithBotRuntimeSettings(
        runtimeSettings({ requireCheckoutLocation: false }),
        async () => {
          const twiml = await whatsappBotService.processCheckoutWithoutLocation({
            companyId,
            employeeId,
            operationId,
            phoneFrom: "+5491111111111",
            phoneTo: "+5491000000000",
            messageSid: "SM-CHECKOUT-1",
            sessionId: "session-checkout-1",
          });

          assert.match(twiml, /no requerida|registrada correctamente/i);
          assert.doesNotMatch(twiml, /Distancia: 0 m/);
        },
      );
    });
  });
});
