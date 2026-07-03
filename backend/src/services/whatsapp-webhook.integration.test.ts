import assert from "node:assert/strict";
import type { Response } from "express";
import { afterEach, describe, it, mock } from "node:test";
import type { CompanyModuleKey } from "../constants/company-modules";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import type { BotSession } from "../types/twilio.types";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import type { WhatsAppInboundContext } from "../types/whatsapp-company-context";
import { EXPIRED_SESSION_USER_MESSAGE } from "../utils/bot-session-expiration";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";
import { extractMessageFromTwiml } from "../utils/twiml-message";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import {
  AMBIGUOUS_COMPANY_MESSAGE,
  COMPANY_CONTEXT_UNAVAILABLE_MESSAGE,
  DUPLICATE_MESSAGE_SID_RESPONSE,
  GLOBAL_CANCEL_MESSAGE,
  LOCATION_WITHOUT_SESSION_MESSAGE,
  MODULE_DISABLED_MESSAGE,
  UNKNOWN_EMPLOYEE_MESSAGE,
} from "./bot/bot-response.builder";
import {
  NO_ACTIVE_FLOW_CANCEL_PREFIX,
  NO_WHATSAPP_OPTIONS_MESSAGE,
  VOLVER_ACTIVE_SESSION_MESSAGE,
} from "./bot/bot-menu.builder";

const companyA = "11111111-1111-1111-1111-111111111111";
const employeeA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const inventoryA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const inventoryB = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const phone = "+5491111111111";
const botNumber = "whatsapp:+10000000000";

const compatibleInventory = (id: string, storeName = "Tienda Centro") => ({
  id,
  storeName,
  scheduledStart: "2026-07-05T15:00:00.000Z",
  scheduledEnd: "2026-07-05T21:00:00.000Z",
  storeLatitude: -34.6,
  storeLongitude: -58.4,
  allowedRadiusMeters: 150,
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 30,
});

const checkoutEligibleInventory = (id: string, storeName = "Tienda Centro") => ({
  id,
  storeName,
  scheduledStart: "2026-07-05T15:00:00.000Z",
  scheduledEnd: "2026-07-05T21:00:00.000Z",
  storeLatitude: -34.6,
  storeLongitude: -58.4,
  allowedRadiusMeters: 150,
});

const defaultEmployee = (companyId: string, id: string) => ({
  id,
  name: "Worker",
  documentNumber: null,
  phoneNumber: phone,
  employeeType: "FIELD" as const,
  active: true,
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  companyId,
});

const enabledStates = () =>
  new Map<CompanyModuleKey, boolean>([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
    [COMPANY_MODULE_KEYS.REPORTS, true],
    [COMPANY_MODULE_KEYS.BOT_SIMULATOR, true],
  ]);

const runtimeSettings = (companyId: string): BotRuntimeSettings => ({
  companyId,
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  geofenceReviewMarginMeters: 30,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  sessionTtlMinutes: 15,
});

const simulationContext = (overrides: Record<string, unknown> = {}) => ({
  simulationSessionId: "sim-webhook",
  employeeIdOverride: employeeA,
  phoneNumber: phone,
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
  ...overrides,
});

const inboundContext = (
  overrides: Partial<WhatsAppInboundContext> = {},
): WhatsAppInboundContext => ({
  companyId: companyA,
  employeeId: employeeA,
  phoneNumber: phone,
  session: null,
  resolutionSource: "employee_phone_unique_match",
  ...overrides,
});

const webhookPayload = (overrides: Partial<TwilioWebhookInput> = {}): TwilioWebhookInput => ({
  MessageSid: `SM-${Math.random().toString(36).slice(2, 10)}`,
  From: `whatsapp:${phone}`,
  To: botNumber,
  Body: "hola",
  ...overrides,
});

const buildSession = (
  companyId: string,
  state: BotSession["state"],
  overrides: Partial<BotSession> = {},
): BotSession => ({
  id: "session-1",
  companyId,
  employeeId: employeeA,
  inventoryId:
    state === "WAITING_LOCATION" || state === "WAITING_CHECKOUT_LOCATION" ? inventoryA : null,
  phoneNumber: phone,
  state,
  contextJson:
    state === "WAITING_INVENTORY_SELECTION" || state === "WAITING_CHECKOUT_INVENTORY_SELECTION"
      ? JSON.stringify({
          inventoryOptions: [
            {
              inventoryId: inventoryA,
              storeName: "Tienda Centro",
              scheduledStart: "2026-07-05T15:00:00.000Z",
            },
          ],
        })
      : null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const createMockResponse = (): { statusCode: number; contentType: string; body: string } & Response => {
  const state = {
    statusCode: 200,
    contentType: "",
    body: "",
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    type(value: string) {
      this.contentType = value;
      return this;
    },
    send(payload: string) {
      this.body = payload;
      return this;
    },
  };

  return state as typeof state & Response;
};

const setupCommonWebhookMocks = async (options: {
  companyId?: string;
  moduleStates?: Map<CompanyModuleKey, boolean>;
  employee?: ReturnType<typeof defaultEmployee> | null;
  sessionResolution?: { activeSession: BotSession | null; recentlyExpired: boolean };
}) => {
  const companyId = options.companyId ?? companyA;
  const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
  const { companyModuleService } = await import("./company-module.service");
  const { botSessionService } = await import("./bot-session.service");
  const { employeeRepository } = await import("../repositories/employee.repository");

  mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () => runtimeSettings(companyId));
  mock.method(companyModuleService, "getModuleStates", async () => options.moduleStates ?? enabledStates());
  mock.method(
    botSessionService,
    "getSessionResolutionByPhone",
    async () => options.sessionResolution ?? { activeSession: null, recentlyExpired: false },
  );

  if (options.employee === null) {
    mock.method(employeeRepository, "findById", async () => null);
    return;
  }

  mock.method(employeeRepository, "findById", async (resolvedCompanyId: string, resolvedEmployeeId: string) => {
    assert.equal(resolvedCompanyId, companyId);
    const employee = options.employee ?? defaultEmployee(companyId, employeeA);
    return employee.id === resolvedEmployeeId ? employee : null;
  });
};

const runSimulatedWebhook = async (input: {
  payload: TwilioWebhookInput;
  inbound?: Partial<WhatsAppInboundContext>;
  simulation?: Record<string, unknown>;
  setup?: () => Promise<void>;
}) => {
  setupUnitTestEnv();
  const { whatsappBotService } = await import("./whatsapp-bot.service");
  await setupCommonWebhookMocks({
    companyId: input.inbound?.companyId ?? companyA,
    employee: input.inbound?.employeeId === null ? null : defaultEmployee(companyA, employeeA),
  });
  if (input.setup) {
    await input.setup();
  }

  let twiml = "";
  await runWithBotRuntimeContext(simulationContext(input.simulation), async () => {
    twiml = await whatsappBotService.handleWebhook(
      inboundContext(input.inbound),
      input.payload,
    );
  });

  return extractMessageFromTwiml(twiml);
};

describe("whatsapp webhook controller company context", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const runController = async (resolution: Awaited<
    ReturnType<
      (typeof import("./whatsapp-company-context.service"))["whatsappCompanyContextService"]["resolve"]
    >
  >) => {
    setupUnitTestEnv();
    const { twilioWebhookController } = await import("../controllers/twilio-webhook.controller");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");
    const { whatsappBotService } = await import("./whatsapp-bot.service");

    let handleWebhookCalls = 0;
    mock.method(whatsappCompanyContextService, "resolve", async () => resolution);
    mock.method(whatsappBotService, "handleWebhook", async () => {
      handleWebhookCalls += 1;
      return "<Response><Message>SHOULD_NOT_RUN</Message></Response>";
    });

    const res = createMockResponse();
    await twilioWebhookController.handleWhatsApp(
      {
        body: webhookPayload({ Body: "Llegué" }),
      } as never,
      res,
    );

    return { res, handleWebhookCalls };
  };

  it("does not execute bot logic when company context is ambiguous", async () => {
    const { res, handleWebhookCalls } = await runController({
      kind: "blocked",
      reason: "ambiguous_company",
      message: AMBIGUOUS_COMPANY_MESSAGE,
    });

    assert.equal(handleWebhookCalls, 0);
    assert.match(res.body, new RegExp(AMBIGUOUS_COMPANY_MESSAGE));
  });

  it("does not execute bot logic when company context is unavailable", async () => {
    const { res, handleWebhookCalls } = await runController({
      kind: "blocked",
      reason: "company_unavailable",
      message: COMPANY_CONTEXT_UNAVAILABLE_MESSAGE,
    });

    assert.equal(handleWebhookCalls, 0);
    assert.match(res.body, new RegExp(COMPANY_CONTEXT_UNAVAILABLE_MESSAGE));
  });

  it("executes bot logic when company context resolves", async () => {
    const { res, handleWebhookCalls } = await runController({
      kind: "resolved",
      context: inboundContext(),
    });

    assert.equal(handleWebhookCalls, 1);
    assert.match(res.body, /SHOULD_NOT_RUN/);
  });
});

describe("whatsapp webhook unknown employee", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns unknown employee message for text", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Llegué" }),
      inbound: { employeeId: employeeA },
      simulation: { employeeIdOverride: null },
      setup: async () => {
        const { employeeRepository } = await import("../repositories/employee.repository");
        mock.method(employeeRepository, "findById", async () => null);
      },
    });

    assert.match(message, new RegExp(UNKNOWN_EMPLOYEE_MESSAGE));
  });

  it("returns unknown employee message for location", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({
        Body: "",
        Latitude: "-34.6",
        Longitude: "-58.4",
      }),
      simulation: { employeeIdOverride: null },
      setup: async () => {
        const { employeeRepository } = await import("../repositories/employee.repository");
        mock.method(employeeRepository, "findById", async () => null);
      },
    });

    assert.match(message, new RegExp(UNKNOWN_EMPLOYEE_MESSAGE));
  });

  it("does not create attendance for unknown employee", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { attendanceRepository } = await import("../repositories/attendance.repository");
    const { botSessionService } = await import("./bot-session.service");
    let attendanceCreates = 0;
    let sessionCreates = 0;

    await setupCommonWebhookMocks({ employee: null });
    mock.method(attendanceRepository, "create", async () => {
      attendanceCreates += 1;
      throw new Error("should not create attendance");
    });
    mock.method(botSessionService, "createWaitingLocationSession", async () => {
      sessionCreates += 1;
      throw new Error("should not create session");
    });

    await runWithBotRuntimeContext(simulationContext({ employeeIdOverride: null }), async () => {
      await whatsappBotService.handleWebhook(
        inboundContext(),
        webhookPayload({ Body: "Llegué" }),
      );
    });

    assert.equal(attendanceCreates, 0);
    assert.equal(sessionCreates, 0);
  });
});

describe("whatsapp webhook dynamic menu", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  for (const command of ["hola", "menu", "menú", "inicio"] as const) {
    it(`returns module-aware menu for "${command}"`, async () => {
      const message = await runSimulatedWebhook({
        payload: webhookPayload({ Body: command }),
      });
      assert.match(message, /Marcar llegada — escribí "Llegué"/);
    });
  }

  it("hides absence when absences is disabled", async () => {
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "menu" }),
      setup: async () => {
        const { companyModuleService } = await import("./company-module.service");
        mock.method(companyModuleService, "getModuleStates", async () => states);
      },
    });
    assert.doesNotMatch(message, /ausencia/i);
    assert.match(message, /Marcar llegada/);
  });

  it("returns no-options message when all employee-facing modules are disabled", async () => {
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "menu" }),
      setup: async () => {
        const { companyModuleService } = await import("./company-module.service");
        mock.method(companyModuleService, "getModuleStates", async () => states);
      },
    });
    assert.match(message, new RegExp(NO_WHATSAPP_OPTIONS_MESSAGE));
  });
});

describe("whatsapp webhook global commands", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  for (const command of ["ayuda", "help"] as const) {
    it(`returns help message for "${command}"`, async () => {
      const message = await runSimulatedWebhook({
        payload: webhookPayload({ Body: command }),
      });
      assert.match(message, /Te puedo ayudar con las opciones habilitadas/);
      assert.match(message, /Marcar llegada — escribí "Llegué"/);
    });
  }

  it("cancels active session with cancelar", async () => {
    let cancelled = 0;
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Cancelar" }),
      setup: async () => {
        const { botSessionService } = await import("./bot-session.service");
        mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
          activeSession: buildSession(companyA, "WAITING_LOCATION"),
          recentlyExpired: false,
        }));
        mock.method(botSessionService, "cancelSession", async () => {
          cancelled += 1;
        });
      },
    });
    assert.equal(cancelled, 1);
    assert.match(message, new RegExp(GLOBAL_CANCEL_MESSAGE));
  });

  it("returns no-active-flow message for cancelar without session", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Cancelar" }),
    });
    assert.match(message, new RegExp(NO_ACTIVE_FLOW_CANCEL_PREFIX));
    assert.match(message, /Marcar llegada/);
  });

  it("returns volver fallback with active session", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "volver" }),
      setup: async () => {
        const { botSessionService } = await import("./bot-session.service");
        mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
          activeSession: buildSession(companyA, "WAITING_LOCATION"),
          recentlyExpired: false,
        }));
      },
    });
    assert.match(message, new RegExp(VOLVER_ACTIVE_SESSION_MESSAGE));
  });

  it("menu during active session does not cancel session", async () => {
    let cancelled = 0;
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "menu" }),
      setup: async () => {
        const { botSessionService } = await import("./bot-session.service");
        mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
          activeSession: buildSession(companyA, "WAITING_LOCATION"),
          recentlyExpired: false,
        }));
        mock.method(botSessionService, "cancelSession", async () => {
          cancelled += 1;
        });
      },
    });
    assert.equal(cancelled, 0);
    assert.match(message, /Tenés un flujo activo/);
  });
});

describe("whatsapp webhook check-in regression", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("starts check-in and asks for location with one compatible inventory", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Llegué" }),
      setup: async () => {
        const { inventoryRepository } = await import("../repositories/inventory.repository");
        const { botSessionService } = await import("./bot-session.service");
        mock.method(inventoryRepository, "findCompatibleForEmployee", async () => [
          compatibleInventory(inventoryA),
        ]);
        mock.method(botSessionService, "createWaitingLocationSession", async (_companyId, input) => {
          assert.equal(input.inventoryId, inventoryA);
        });
      },
    });
    assert.match(message, /ubicación actual/i);
  });

  it("asks for inventory selection with multiple compatible inventories", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Llegué" }),
      setup: async () => {
        const { inventoryRepository } = await import("../repositories/inventory.repository");
        const { botSessionService } = await import("./bot-session.service");
        mock.method(inventoryRepository, "findCompatibleForEmployee", async () => [
          compatibleInventory(inventoryA, "Tienda A"),
          compatibleInventory(inventoryB, "Tienda B"),
        ]);
        mock.method(botSessionService, "createInventorySelectionSession", async () => undefined);
      },
    });
    assert.match(message, /seleccioná el inventario|Respondé con el número/i);
  });

  it("blocks check-in when attendance is disabled", async () => {
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Llegué" }),
      setup: async () => {
        const { companyModuleService } = await import("./company-module.service");
        mock.method(companyModuleService, "getModuleStates", async () => states);
      },
    });
    assert.match(message, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  it("returns expired session message for numeric selection after expired session", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "1" }),
      setup: async () => {
        const { botSessionService } = await import("./bot-session.service");
        mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
          activeSession: null,
          recentlyExpired: true,
        }));
      },
    });
    assert.match(message, new RegExp(EXPIRED_SESSION_USER_MESSAGE));
  });

  it("returns location-without-session message for unsolicited location", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({
        Body: "",
        Latitude: "-34.6",
        Longitude: "-58.4",
      }),
    });
    assert.match(message, new RegExp(LOCATION_WITHOUT_SESSION_MESSAGE));
  });
});

describe("whatsapp webhook checkout regression", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("starts checkout and asks for location with one eligible inventory", async () => {
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Me voy" }),
      setup: async () => {
        const { attendanceRepository } = await import("../repositories/attendance.repository");
        const { botSessionService } = await import("./bot-session.service");
        mock.method(attendanceRepository, "findCheckoutEligibleInventories", async () => [
          checkoutEligibleInventory(inventoryA),
        ]);
        mock.method(botSessionService, "createWaitingCheckoutLocationSession", async () => undefined);
      },
    });
    assert.match(message, /ubicación actual/i);
  });

  it("blocks checkout when attendance is disabled", async () => {
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Me voy" }),
      setup: async () => {
        const { companyModuleService } = await import("./company-module.service");
        mock.method(companyModuleService, "getModuleStates", async () => states);
      },
    });
    assert.match(message, new RegExp(MODULE_DISABLED_MESSAGE));
  });
});

describe("whatsapp webhook absence regression", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("starts absence flow when absences is enabled", async () => {
    let absenceStarted = 0;
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Pedir ausencia" }),
      setup: async () => {
        const { absenceBotService } = await import("./absence-bot.service");
        mock.method(absenceBotService, "hasActiveAttendanceSession", () => false);
        mock.method(absenceBotService, "startAbsenceFlow", async () => {
          absenceStarted += 1;
          return "<Response><Message>ABSENCE_FLOW</Message></Response>";
        });
      },
    });
    assert.equal(absenceStarted, 1);
    assert.match(message, /ABSENCE_FLOW/);
  });

  it("blocks absence when absences is disabled", async () => {
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    let absenceStarted = 0;
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Pedir ausencia" }),
      setup: async () => {
        const { companyModuleService } = await import("./company-module.service");
        const { absenceBotService } = await import("./absence-bot.service");
        mock.method(companyModuleService, "getModuleStates", async () => states);
        mock.method(absenceBotService, "startAbsenceFlow", async () => {
          absenceStarted += 1;
          return "<Response><Message>ABSENCE_FLOW</Message></Response>";
        });
      },
    });
    assert.equal(absenceStarted, 0);
    assert.match(message, new RegExp(MODULE_DISABLED_MESSAGE));
  });

  it("cancels active absence session before absence handler runs", async () => {
    let absenceHandled = 0;
    let cancelled = 0;
    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Cancelar" }),
      setup: async () => {
        const { botSessionService } = await import("./bot-session.service");
        const { absenceBotService } = await import("./absence-bot.service");
        mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
          activeSession: buildSession(companyA, "WAITING_ABSENCE_TYPE"),
          recentlyExpired: false,
        }));
        mock.method(botSessionService, "cancelSession", async () => {
          cancelled += 1;
        });
        mock.method(absenceBotService, "handleAbsenceSession", async () => {
          absenceHandled += 1;
          return "<Response><Message>ABSENCE_SESSION</Message></Response>";
        });
      },
    });
    assert.equal(cancelled, 1);
    assert.equal(absenceHandled, 0);
    assert.match(message, new RegExp(GLOBAL_CANCEL_MESSAGE));
  });
});

describe("whatsapp webhook multi-company isolation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("scopes employee lookup to inbound company context", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { employeeRepository } = await import("../repositories/employee.repository");
    let findByIdCompanyId: string | null = null;

    await setupCommonWebhookMocks({ companyId: companyA });
    mock.method(employeeRepository, "findById", async (resolvedCompanyId: string) => {
      findByIdCompanyId = resolvedCompanyId;
      return defaultEmployee(companyA, employeeA);
    });

    await runWithBotRuntimeContext(simulationContext({ employeeIdOverride: null }), async () => {
      await whatsappBotService.handleWebhook(
        inboundContext({ companyId: companyA, employeeId: employeeA }),
        webhookPayload({ Body: "menu" }),
      );
    });

    assert.equal(findByIdCompanyId, companyA);
  });

  it("does not use company B module states for company A webhook", async () => {
    const statesA = enabledStates();
    const statesB = enabledStates();
    statesB.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    const message = await runSimulatedWebhook({
      payload: webhookPayload({ Body: "Llegué" }),
      inbound: { companyId: companyA },
      setup: async () => {
        const { companyModuleService } = await import("./company-module.service");
        mock.method(companyModuleService, "getModuleStates", async (resolvedCompanyId: string) =>
          resolvedCompanyId === companyA ? statesA : statesB,
        );
        const { inventoryRepository } = await import("../repositories/inventory.repository");
        const { botSessionService } = await import("./bot-session.service");
        mock.method(inventoryRepository, "findCompatibleForEmployee", async (resolvedCompanyId: string) => {
          assert.equal(resolvedCompanyId, companyA);
          return [compatibleInventory(inventoryA)];
        });
        mock.method(botSessionService, "createWaitingLocationSession", async () => undefined);
      },
    });

    assert.doesNotMatch(message, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.match(message, /ubicación actual/i);
  });
});

describe("whatsapp webhook bot simulator regression", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("works with forced company context and records greeting intent", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { getBotRuntimeContext } = await import("../utils/bot-runtime-context");

    await setupCommonWebhookMocks({ companyId: companyA });

    await runWithBotRuntimeContext(simulationContext(), async () => {
      await whatsappBotService.handleWebhook(
        inboundContext({
          companyId: companyA,
          resolutionSource: "simulation_forced_company",
        }),
        webhookPayload({ Body: "ayuda" }),
      );
      assert.equal(getBotRuntimeContext()?.lastDetectedIntent, "greeting");
      assert.match(getBotRuntimeContext()?.lastBotResponse ?? "", /Te puedo ayudar/);
    });
  });

  it("returns duplicate MessageSid response without simulation context", async () => {
    setupUnitTestEnv();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { whatsappMessageRepository } = await import("../repositories/whatsapp-message.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
    const { companyModuleService } = await import("./company-module.service");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { botSessionService } = await import("./bot-session.service");
    let attendanceCreates = 0;

    mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () => runtimeSettings(companyA));
    mock.method(companyModuleService, "getModuleStates", async () => enabledStates());
    mock.method(employeeRepository, "findById", async () => defaultEmployee(companyA, employeeA));
    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));
    mock.method(whatsappMessageRepository, "findByMessageSid", async () => ({
      id: "existing-message",
      messageSid: "SM-DUP",
    }));
    mock.method(whatsappMessageRepository, "updateProcessingStatus", async () => undefined);

    const { attendanceRepository } = await import("../repositories/attendance.repository");
    mock.method(attendanceRepository, "create", async () => {
      attendanceCreates += 1;
      throw new Error("should not create attendance");
    });

    const twiml = await whatsappBotService.handleWebhook(
      inboundContext(),
      webhookPayload({ MessageSid: "SM-DUP", Body: "Llegué" }),
    );

    assert.match(extractMessageFromTwiml(twiml), new RegExp(DUPLICATE_MESSAGE_SID_RESPONSE));
    assert.equal(attendanceCreates, 0);
  });
});
