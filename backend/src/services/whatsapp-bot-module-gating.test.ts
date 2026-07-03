import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { MODULE_DISABLED_MESSAGE } from "./bot/bot-response.builder";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";

const simulationContext = () => ({
  simulationSessionId: "sim-gating",
  employeeIdOverride: employeeId,
  phoneNumber: "+5491111111111",
  simulatedNow: new Date(),
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

const enabledStates = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
    [COMPANY_MODULE_KEYS.REPORTS, true],
    [COMPANY_MODULE_KEYS.BOT_SIMULATOR, true],
  ]);

const inboundContext = {
  companyId,
  employeeId,
  phoneNumber: "+5491111111111",
  session: null,
  resolutionSource: "employee_phone_unique_match" as const,
};

describe("whatsapp bot module gating", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("blocks check-in when attendance module is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { companyModuleService } = await import("./company-module.service");
    const { botSessionService } = await import("./bot-session.service");
    const { employeeRepository } = await import("../repositories/employee.repository");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    mock.method(companyModuleService, "getModuleStates", async () => states);
    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeId,
      name: "Worker",
      documentNumber: null,
      phoneNumber: "+5491111111111",
      employeeType: "FIELD",
      active: true,
      lastWorkedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleTextMessage({
        companyId,
        payload: {
          MessageSid: "SM-CHECKIN-BLOCKED",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Body: "Llegué",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  it("blocks check-out when attendance module is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleTextMessage({
        companyId,
        payload: {
          MessageSid: "SM-CHECKOUT-BLOCKED",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Body: "Me voy",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  it("blocks absence requests when absences module is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleTextMessage({
        companyId,
        payload: {
          MessageSid: "SM-ABSENCE-BLOCKED",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Body: "Pedir ausencia",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  it("allows greeting when modules are enabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");

    const states = enabledStates();
    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleTextMessage({
        companyId,
        payload: {
          MessageSid: "SM-GREETING",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Body: "hola",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, /Llegué/);
    assert.doesNotMatch(response, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  it("resolves employee only within the inbound company context", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { companyModuleService } = await import("./company-module.service");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
    const { whatsappMessageRepository } = await import("../repositories/whatsapp-message.repository");

    const states = enabledStates();
    let findByPhoneCalls = 0;

    mock.method(companyModuleService, "getModuleStates", async () => states);
    mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () => ({
      companyId,
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: 150,
      geofenceReviewMarginMeters: 30,
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 15,
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
      sessionTtlMinutes: 15,
    }));
    mock.method(whatsappMessageRepository, "findByMessageSid", async () => null);
    mock.method(whatsappMessageRepository, "create", async () => undefined);
    mock.method(whatsappMessageRepository, "updateProcessingStatus", async () => undefined);
    mock.method(employeeRepository, "findById", async (resolvedCompanyId: string, resolvedEmployeeId: string) => {
      assert.equal(resolvedCompanyId, companyId);
      assert.equal(resolvedEmployeeId, employeeId);
      return {
        id: employeeId,
        name: "Worker",
        documentNumber: null,
        phoneNumber: "+5491111111111",
        employeeType: "FIELD",
        active: true,
        lastWorkedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    });
    mock.method(employeeRepository, "findByPhone", async () => {
      findByPhoneCalls += 1;
      return null;
    });

    const { botSessionService } = await import("./bot-session.service");
    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));

    await whatsappBotService.handleWebhook(inboundContext, {
      MessageSid: "SM-EMPLOYEE-SCOPE",
      From: "whatsapp:+5491111111111",
      To: "whatsapp:+10000000000",
      Body: "hola",
    });

    assert.equal(findByPhoneCalls, 0);
  });
});
