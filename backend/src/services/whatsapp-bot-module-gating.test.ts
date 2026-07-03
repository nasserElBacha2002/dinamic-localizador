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

    assert.match(response, /Marcar llegada/);
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

const inventoryId = "00000000-0000-4000-8000-000000000003";

const buildBotSession = (
  state:
    | "WAITING_LOCATION"
    | "WAITING_CHECKOUT_LOCATION"
    | "WAITING_CHECKOUT_INVENTORY_SELECTION"
    | "WAITING_ABSENCE_TYPE"
    | "WAITING_ABSENCE_START_DATE"
    | "WAITING_ABSENCE_END_DATE"
    | "WAITING_ABSENCE_REASON"
    | "WAITING_ABSENCE_CONFIRMATION",
) => ({
  id: "session-1",
  companyId,
  employeeId,
  inventoryId:
    state === "WAITING_LOCATION" || state === "WAITING_CHECKOUT_LOCATION" ? inventoryId : null,
  phoneNumber: "+5491111111111",
  state,
  contextJson: state === "WAITING_CHECKOUT_INVENTORY_SELECTION" ? JSON.stringify({ inventoryOptions: [] }) : null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("whatsapp bot session module gating", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("blocks location check-in when attendance is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");
    const { attendanceRepository } = await import("../repositories/attendance.repository");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    let attendanceCreates = 0;

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: buildBotSession("WAITING_LOCATION"),
      recentlyExpired: false,
    }));
    mock.method(attendanceRepository, "create", async () => {
      attendanceCreates += 1;
      throw new Error("should not create attendance");
    });

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleLocationMessage({
        companyId,
        payload: {
          MessageSid: "SM-LOC-CHECKIN-ATT",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(attendanceCreates, 0);
  });

  it("blocks location check-in when inventory_operations is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");
    const { attendanceRepository } = await import("../repositories/attendance.repository");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);
    let attendanceCreates = 0;

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: buildBotSession("WAITING_LOCATION"),
      recentlyExpired: false,
    }));
    mock.method(attendanceRepository, "create", async () => {
      attendanceCreates += 1;
      throw new Error("should not create attendance");
    });

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleLocationMessage({
        companyId,
        payload: {
          MessageSid: "SM-LOC-CHECKIN-INV",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(attendanceCreates, 0);
  });

  it("blocks location checkout when attendance is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    let sessionCompleted = 0;

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: buildBotSession("WAITING_CHECKOUT_LOCATION"),
      recentlyExpired: false,
    }));
    mock.method(botSessionService, "completeSession", async () => {
      sessionCompleted += 1;
    });

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleLocationMessage({
        companyId,
        payload: {
          MessageSid: "SM-LOC-CHECKOUT",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(sessionCompleted, 0);
  });

  it("blocks checkout inventory selection location prompt when attendance is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");

    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: buildBotSession("WAITING_CHECKOUT_INVENTORY_SELECTION"),
      recentlyExpired: false,
    }));

    const response = await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleLocationMessage({
        companyId,
        payload: {
          MessageSid: "SM-LOC-CHECKOUT-SEL",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  for (const state of [
    "WAITING_ABSENCE_TYPE",
    "WAITING_ABSENCE_START_DATE",
    "WAITING_ABSENCE_END_DATE",
    "WAITING_ABSENCE_REASON",
    "WAITING_ABSENCE_CONFIRMATION",
  ] as const) {
    it(`blocks active ${state} session when absences is disabled`, async () => {
      setupUnitTestEnv();
      const { whatsappBotService } = await import("./whatsapp-bot.service");
      const { botSessionService } = await import("./bot-session.service");
      const { absenceBotService } = await import("./absence-bot.service");

      const states = enabledStates();
      states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
      let absenceHandled = 0;

      mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
        activeSession: buildBotSession(state),
        recentlyExpired: false,
      }));
      mock.method(absenceBotService, "handleAbsenceSession", async () => {
        absenceHandled += 1;
        return "<Response></Response>";
      });

      const response = await runWithBotRuntimeContext(simulationContext(), async () =>
        whatsappBotService.handleTextMessage({
          companyId,
          payload: {
            MessageSid: `SM-ABS-${state}`,
            From: "whatsapp:+5491111111111",
            To: "whatsapp:+10000000000",
            Body: "2026-07-10",
          },
          phoneFrom: "+5491111111111",
          phoneTo: "whatsapp:+10000000000",
          employeeId,
          moduleStates: states,
        }),
      );

      assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
      assert.equal(absenceHandled, 0);
    });
  }

  it("continues absence session when absences is enabled", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { botSessionService } = await import("./bot-session.service");
    const { absenceBotService } = await import("./absence-bot.service");

    const states = enabledStates();
    let absenceHandled = 0;

    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: buildBotSession("WAITING_ABSENCE_TYPE"),
      recentlyExpired: false,
    }));
    mock.method(absenceBotService, "handleAbsenceSession", async () => {
      absenceHandled += 1;
      return "<?xml version=\"1.0\"?><Response><Message>ok</Message></Response>";
    });

    await runWithBotRuntimeContext(simulationContext(), async () =>
      whatsappBotService.handleTextMessage({
        companyId,
        payload: {
          MessageSid: "SM-ABS-ENABLED",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Body: "1",
        },
        phoneFrom: "+5491111111111",
        phoneTo: "whatsapp:+10000000000",
        employeeId,
        moduleStates: states,
      }),
    );

    assert.equal(absenceHandled, 1);
  });
});
