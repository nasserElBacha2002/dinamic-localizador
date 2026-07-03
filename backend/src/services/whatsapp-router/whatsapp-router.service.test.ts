import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import type { BotSession } from "../../types/twilio.types";
import {
  GLOBAL_CANCEL_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE,
  LOCATION_DURING_SELECTION_MESSAGE,
  MODULE_DISABLED_MESSAGE,
  UNKNOWN_EMPLOYEE_MESSAGE,
  WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE,
  WAITING_LOCATION_TEXT_MESSAGE,
} from "../bot/bot-response.builder";
import {
  buildGreetingMessage,
  NO_ACTIVE_FLOW_CANCEL_PREFIX,
  VOLVER_ACTIVE_SESSION_MESSAGE,
} from "../bot/bot-menu.builder";
import { EXPIRED_SESSION_USER_MESSAGE } from "../../utils/bot-session-expiration";
import { InvalidCoordinatesError } from "../../utils/haversine";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const inventoryId = "00000000-0000-4000-8000-000000000003";

const enabledStates = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
    [COMPANY_MODULE_KEYS.REPORTS, true],
    [COMPANY_MODULE_KEYS.BOT_SIMULATOR, true],
  ]);

const buildSession = (
  state: BotSession["state"],
  overrides: Partial<BotSession> = {},
): BotSession => ({
  id: "session-1",
  companyId,
  employeeId,
  inventoryId:
    state === "WAITING_LOCATION" || state === "WAITING_CHECKOUT_LOCATION" ? inventoryId : null,
  phoneNumber: "+5491111111111",
  state,
  contextJson:
    state === "WAITING_CHECKOUT_INVENTORY_SELECTION" || state === "WAITING_INVENTORY_SELECTION"
      ? JSON.stringify({ inventoryOptions: [] })
      : null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const baseContext = (overrides: Partial<WhatsAppRouterContext> = {}): WhatsAppRouterContext => ({
  companyId,
  employeeId,
  payload: {
    MessageSid: "SM-ROUTER-1",
    From: "whatsapp:+5491111111111",
    To: "whatsapp:+10000000000",
    Body: "Llegué",
  },
  messageType: "TEXT",
  phoneFrom: "+5491111111111",
  phoneTo: "whatsapp:+10000000000",
  moduleStates: enabledStates(),
  session: null,
  recentlyExpired: false,
  body: "Llegué",
  ...overrides,
});

type HandlerCalls = {
  respond: number;
  startCheckIn: number;
  startCheckout: number;
  handleInventorySelection: number;
  handleCheckoutInventorySelection: number;
  processLocationCheckIn: number;
  processLocationCheckout: number;
};

const createMockHandlers = (): { handlers: WhatsAppRouterHandlers; calls: HandlerCalls } => {
  const calls: HandlerCalls = {
    respond: 0,
    startCheckIn: 0,
    startCheckout: 0,
    handleInventorySelection: 0,
    handleCheckoutInventorySelection: 0,
    processLocationCheckIn: 0,
    processLocationCheckout: 0,
  };

  const handlers: WhatsAppRouterHandlers = {
    respond: async (_companyId, input) => {
      calls.respond += 1;
      return `<Response><Message>${input.message}</Message></Response>`;
    },
    startCheckIn: async () => {
      calls.startCheckIn += 1;
      return "<Response><Message>CHECKIN_STARTED</Message></Response>";
    },
    startCheckout: async () => {
      calls.startCheckout += 1;
      return "<Response><Message>CHECKOUT_STARTED</Message></Response>";
    },
    handleInventorySelection: async () => {
      calls.handleInventorySelection += 1;
      return "<Response><Message>INVENTORY_SELECTED</Message></Response>";
    },
    handleCheckoutInventorySelection: async () => {
      calls.handleCheckoutInventorySelection += 1;
      return "<Response><Message>CHECKOUT_INVENTORY_SELECTED</Message></Response>";
    },
    processLocationCheckIn: async () => {
      calls.processLocationCheckIn += 1;
      return "<Response><Message>CHECKIN_LOCATION_OK</Message></Response>";
    },
    processLocationCheckout: async () => {
      calls.processLocationCheckout += 1;
      return "<Response><Message>CHECKOUT_LOCATION_OK</Message></Response>";
    },
  };

  return { handlers, calls };
};

describe("whatsappRouterService.routeTextMessage", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns unknown employee message when employeeId is null", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ employeeId: null }),
      handlers,
    );

    assert.match(response, new RegExp(UNKNOWN_EMPLOYEE_MESSAGE));
    assert.equal(calls.startCheckIn, 0);
    assert.equal(calls.respond, 1);
  });

  it("routes Llegué to attendance handler when modules are enabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Llegué", payload: { ...baseContext().payload, Body: "Llegué" } }),
      handlers,
    );

    assert.match(response, /CHECKIN_STARTED/);
    assert.equal(calls.startCheckIn, 1);
    assert.equal(calls.startCheckout, 0);
  });

  it("blocks Llegué when attendance is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Llegué", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(calls.startCheckIn, 0);
  });

  it("blocks Llegué when inventory_operations is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS, false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Llegué", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(calls.startCheckIn, 0);
  });

  it("routes Me voy to checkout handler when attendance is enabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Me voy" }),
      handlers,
    );

    assert.match(response, /CHECKOUT_STARTED/);
    assert.equal(calls.startCheckout, 1);
    assert.equal(calls.startCheckIn, 0);
  });

  it("blocks Me voy when attendance is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Me voy", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(calls.startCheckout, 0);
  });

  it("routes Pedir ausencia to absence handler when absences is enabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { absenceBotService } = await import("../absence-bot.service");
    const { handlers, calls } = createMockHandlers();
    let absenceStarted = 0;

    mock.method(absenceBotService, "startAbsenceFlow", async () => {
      absenceStarted += 1;
      return "<Response><Message>ABSENCE_STARTED</Message></Response>";
    });
    mock.method(absenceBotService, "hasActiveAttendanceSession", () => false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Pedir ausencia" }),
      handlers,
    );

    assert.match(response, /ABSENCE_STARTED/);
    assert.equal(absenceStarted, 1);
    assert.equal(calls.startCheckIn, 0);
  });

  it("blocks Pedir ausencia when absences is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { absenceBotService } = await import("../absence-bot.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);
    let absenceStarted = 0;

    mock.method(absenceBotService, "startAbsenceFlow", async () => {
      absenceStarted += 1;
      return "<Response><Message>ABSENCE_STARTED</Message></Response>";
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Pedir ausencia", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(absenceStarted, 0);
    assert.equal(calls.startCheckIn, 0);
  });

  it("routes unknown text to module-aware menu", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const expectedMenu = buildGreetingMessage(enabledStates());

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "texto random" }),
      handlers,
    );

    assert.match(response, new RegExp(expectedMenu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40)));
    assert.match(response, /Marcar llegada/);
    assert.equal(calls.startCheckIn, 0);
    assert.equal(calls.startCheckout, 0);
  });

  it("returns expired session message for numeric selection after expired session", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: null,
        recentlyExpired: true,
      }),
      handlers,
    );

    assert.match(response, new RegExp(EXPIRED_SESSION_USER_MESSAGE));
    assert.equal(calls.startCheckIn, 0);
    assert.equal(calls.handleInventorySelection, 0);
  });

  for (const command of ["menú", "menu", "inicio"] as const) {
    it(`routes "${command}" to module-aware menu`, async () => {
      setupUnitTestEnv();
      const { whatsappRouterService } = await import("./whatsapp-router.service");
      const { handlers, calls } = createMockHandlers();

      const response = await whatsappRouterService.routeTextMessage(
        baseContext({ body: command }),
        handlers,
      );

      assert.match(response, /Marcar llegada — escribí "Llegué"/);
      assert.equal(calls.startCheckIn, 0);
      assert.equal(calls.startCheckout, 0);
    });
  }

  for (const command of ["ayuda", "help"] as const) {
    it(`routes "${command}" to help message with dynamic menu`, async () => {
      setupUnitTestEnv();
      const { whatsappRouterService } = await import("./whatsapp-router.service");
      const { handlers, calls } = createMockHandlers();

      const response = await whatsappRouterService.routeTextMessage(
        baseContext({ body: command }),
        handlers,
      );

      assert.match(response, /Te puedo ayudar con las opciones habilitadas/);
      assert.match(response, /Marcar llegada — escribí "Llegué"/);
      assert.equal(calls.startCheckIn, 0);
      assert.equal(calls.startCheckout, 0);
    });
  }

  for (const sessionState of [
    "WAITING_LOCATION",
    "WAITING_CHECKOUT_LOCATION",
    "WAITING_ABSENCE_TYPE",
  ] as const) {
    it(`menu command during ${sessionState} does not cancel session`, async () => {
      setupUnitTestEnv();
      const { whatsappRouterService } = await import("./whatsapp-router.service");
      const { botSessionService } = await import("../bot-session.service");
      const { handlers } = createMockHandlers();
      let cancelled = 0;

      mock.method(botSessionService, "cancelSession", async () => {
        cancelled += 1;
      });

      const response = await whatsappRouterService.routeTextMessage(
        baseContext({
          body: "menu",
          session: buildSession(sessionState),
        }),
        handlers,
      );

      assert.match(response, /Tenés un flujo activo/);
      assert.match(response, /Marcar llegada/);
      assert.equal(cancelled, 0);
    });
  }

  it("cancels an active session when user sends Cancelar", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { botSessionService } = await import("../bot-session.service");
    const { handlers, calls } = createMockHandlers();
    let cancelled = 0;

    mock.method(botSessionService, "cancelSession", async () => {
      cancelled += 1;
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "Cancelar",
        session: buildSession("WAITING_LOCATION"),
      }),
      handlers,
    );

    assert.match(response, new RegExp(GLOBAL_CANCEL_MESSAGE));
    assert.equal(cancelled, 1);
    assert.equal(calls.startCheckIn, 0);
  });

  it("cancels an active session when user sends salir", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { botSessionService } = await import("../bot-session.service");
    const { handlers, calls } = createMockHandlers();
    let cancelled = 0;

    mock.method(botSessionService, "cancelSession", async () => {
      cancelled += 1;
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "salir",
        session: buildSession("WAITING_CHECKOUT_LOCATION"),
      }),
      handlers,
    );

    assert.match(response, new RegExp(GLOBAL_CANCEL_MESSAGE));
    assert.equal(cancelled, 1);
    assert.equal(calls.startCheckout, 0);
  });

  it("returns friendly no-active-flow message when Cancelar is sent without active session", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "Cancelar", session: null }),
      handlers,
    );

    assert.match(response, new RegExp(NO_ACTIVE_FLOW_CANCEL_PREFIX));
    assert.match(response, /Marcar llegada/);
    assert.equal(calls.startCheckIn, 0);
  });

  it("returns friendly no-active-flow message when salir is sent without active session", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "salir", session: null }),
      handlers,
    );

    assert.match(response, new RegExp(NO_ACTIVE_FLOW_CANCEL_PREFIX));
    assert.match(response, /Marcar llegada/);
    assert.equal(calls.startCheckout, 0);
  });

  it("returns safe volver message with active session", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { botSessionService } = await import("../bot-session.service");
    const { handlers } = createMockHandlers();
    let cancelled = 0;

    mock.method(botSessionService, "cancelSession", async () => {
      cancelled += 1;
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "volver",
        session: buildSession("WAITING_LOCATION"),
      }),
      handlers,
    );

    assert.match(response, new RegExp(VOLVER_ACTIVE_SESSION_MESSAGE));
    assert.equal(cancelled, 0);
  });

  it("returns menu when volver is sent without active session", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "volver", session: null }),
      handlers,
    );

    assert.match(response, /Marcar llegada — escribí "Llegué"/);
  });

  it("routes active check-in inventory selection to attendance handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_INVENTORY_SELECTION"),
      }),
      handlers,
    );

    assert.match(response, /INVENTORY_SELECTED/);
    assert.equal(calls.handleInventorySelection, 1);
  });

  it("routes active check-in location wait to attendance handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "hola",
        session: buildSession("WAITING_LOCATION"),
      }),
      handlers,
    );

    assert.match(response, new RegExp(WAITING_LOCATION_TEXT_MESSAGE));
    assert.equal(calls.startCheckIn, 0);
  });

  it("routes active checkout inventory selection to checkout handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_CHECKOUT_INVENTORY_SELECTION"),
      }),
      handlers,
    );

    assert.match(response, /CHECKOUT_INVENTORY_SELECTED/);
    assert.equal(calls.handleCheckoutInventorySelection, 1);
  });

  it("routes active checkout location wait to checkout handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "hola",
        session: buildSession("WAITING_CHECKOUT_LOCATION"),
      }),
      handlers,
    );

    assert.match(response, new RegExp(WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE));
    assert.equal(calls.startCheckout, 0);
  });

  it("routes active absence session to absence handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { absenceBotService } = await import("../absence-bot.service");
    const { handlers } = createMockHandlers();
    let absenceHandled = 0;

    mock.method(absenceBotService, "handleAbsenceSession", async () => {
      absenceHandled += 1;
      return "<Response><Message>ABSENCE_SESSION</Message></Response>";
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_ABSENCE_TYPE"),
      }),
      handlers,
    );

    assert.match(response, /ABSENCE_SESSION/);
    assert.equal(absenceHandled, 1);
  });
  it("returns help with active-flow note during active session", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "ayuda",
        session: buildSession("WAITING_LOCATION"),
      }),
      handlers,
    );

    assert.match(response, /Te puedo ayudar con las opciones habilitadas/);
    assert.match(response, /Tenés un flujo activo/);
  });
});

describe("whatsappRouterService.routeLocationMessage", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns unknown employee message when employeeId is null", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        employeeId: null,
        messageType: "LOCATION",
        payload: {
          MessageSid: "SM-LOC-UNKNOWN",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
      }),
      handlers,
    );

    assert.match(response, new RegExp(UNKNOWN_EMPLOYEE_MESSAGE));
    assert.equal(calls.processLocationCheckIn, 0);
    assert.equal(calls.processLocationCheckout, 0);
  });

  it("routes WAITING_LOCATION to check-in location handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_LOCATION"),
        payload: {
          MessageSid: "SM-LOC-1",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
      }),
      handlers,
    );

    assert.match(response, /CHECKIN_LOCATION_OK/);
    assert.equal(calls.processLocationCheckIn, 1);
    assert.equal(calls.processLocationCheckout, 0);
  });

  it("returns selection prompt for location during check-in inventory selection", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_INVENTORY_SELECTION"),
        payload: {
          MessageSid: "SM-LOC-2",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
      }),
      handlers,
    );

    assert.match(response, new RegExp(LOCATION_DURING_SELECTION_MESSAGE));
    assert.equal(calls.processLocationCheckIn, 0);
  });

  it("routes WAITING_CHECKOUT_LOCATION to checkout location handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_CHECKOUT_LOCATION"),
        payload: {
          MessageSid: "SM-LOC-3",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
      }),
      handlers,
    );

    assert.match(response, /CHECKOUT_LOCATION_OK/);
    assert.equal(calls.processLocationCheckout, 1);
  });

  it("returns selection prompt for location during checkout inventory selection", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_CHECKOUT_INVENTORY_SELECTION"),
        payload: {
          MessageSid: "SM-LOC-4",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "-58.4",
        },
      }),
      handlers,
    );

    assert.match(response, new RegExp(LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE));
    assert.equal(calls.processLocationCheckout, 0);
  });

  it("returns invalid coordinates message for check-in location processing errors", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    handlers.processLocationCheckIn = async () => {
      calls.processLocationCheckIn += 1;
      throw new InvalidCoordinatesError("Latitude must be between -90 and 90");
    };

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_LOCATION"),
        payload: {
          MessageSid: "SM-LOC-INVALID-CHECKIN",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "999",
          Longitude: "-58.4",
        },
      }),
      handlers,
    );

    assert.match(response, new RegExp(INVALID_COORDINATES_MESSAGE));
    assert.equal(calls.processLocationCheckIn, 1);
    assert.equal(calls.processLocationCheckout, 0);
  });

  it("returns invalid coordinates message for checkout location processing errors", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    handlers.processLocationCheckout = async () => {
      calls.processLocationCheckout += 1;
      throw new InvalidCoordinatesError("Longitude must be between -180 and 180");
    };

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_CHECKOUT_LOCATION"),
        payload: {
          MessageSid: "SM-LOC-INVALID-CHECKOUT",
          From: "whatsapp:+5491111111111",
          To: "whatsapp:+10000000000",
          Latitude: "-34.6",
          Longitude: "999",
        },
      }),
      handlers,
    );

    assert.match(response, new RegExp(INVALID_COORDINATES_MESSAGE));
    assert.equal(calls.processLocationCheckout, 1);
    assert.equal(calls.processLocationCheckIn, 0);
  });
});
