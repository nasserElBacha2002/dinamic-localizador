import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import type { BotSession } from "../../types/twilio.types";
import {
  GLOBAL_CANCEL_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  INVALID_SELECTION_MESSAGE,
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
const operationId = "00000000-0000-4000-8000-000000000003";

const enabledStates = () =>
  new Map([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.OPERATIONS, true],
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
  operationId:
    state === "WAITING_LOCATION" || state === "WAITING_CHECKOUT_LOCATION" ? operationId : null,
  phoneNumber: "+5491111111111",
  state,
  contextJson:
    state === "WAITING_CHECKOUT_OPERATION_SELECTION" || state === "WAITING_OPERATION_SELECTION"
      ? JSON.stringify({ operationOptions: [] })
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
  handleOperationSelection: number;
  handleCheckoutOperationSelection: number;
  processLocationCheckIn: number;
  processLocationCheckout: number;
};

const createMockHandlers = (): { handlers: WhatsAppRouterHandlers; calls: HandlerCalls } => {
  const calls: HandlerCalls = {
    respond: 0,
    startCheckIn: 0,
    startCheckout: 0,
    handleOperationSelection: 0,
    handleCheckoutOperationSelection: 0,
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
    handleOperationSelection: async () => {
      calls.handleOperationSelection += 1;
      return "<Response><Message>OPERATION_SELECTED</Message></Response>";
    },
    handleCheckoutOperationSelection: async () => {
      calls.handleCheckoutOperationSelection += 1;
      return "<Response><Message>CHECKOUT_OPERATION_SELECTED</Message></Response>";
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

  it("blocks Llegué when operations is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);

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
    assert.equal(calls.handleOperationSelection, 0);
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

  it("routes active check-in operation selection to attendance handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_OPERATION_SELECTION"),
      }),
      handlers,
    );

    assert.match(response, /OPERATION_SELECTED/);
    assert.equal(calls.handleOperationSelection, 1);
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

  it("routes active checkout operation selection to checkout handler", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_CHECKOUT_OPERATION_SELECTION"),
      }),
      handlers,
    );

    assert.match(response, /CHECKOUT_OPERATION_SELECTED/);
    assert.equal(calls.handleCheckoutOperationSelection, 1);
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

  it("returns selection prompt for location during check-in operation selection", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_OPERATION_SELECTION"),
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

  it("returns selection prompt for location during checkout operation selection", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeLocationMessage(
      baseContext({
        messageType: "LOCATION",
        session: buildSession("WAITING_CHECKOUT_OPERATION_SELECTION"),
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

const sampleAssignedOperation = (id = operationId) => ({
  operationId: id,
  serviceName: "Carrefour Palermo",
  serviceAddress: "Av. Santa Fe 1234",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  scheduledStart: "2026-07-08T23:30:00.000Z",
  scheduledEnd: "2026-07-09T06:00:00.000Z",
  operationStatus: "SCHEDULED",
  confirmationStatus: "PENDING" as const,
  attendanceReceivedAt: null,
  attendanceCheckoutAt: null,
  punctualityStatus: null,
});

describe("whatsappRouterService Task 5 workday and assignments", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("routes mi jornada to workday handler when modules are enabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    mock.method(employeeWorkdayService, "buildTodayWorkdayMessage", async () => "WORKDAY_OK");

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "mi jornada", payload: { ...baseContext().payload, Body: "mi jornada" } }),
      handlers,
    );

    assert.match(response, /WORKDAY_OK/);
    assert.equal(calls.startCheckIn, 0);
    assert.equal(calls.respond, 1);
  });

  it("blocks mi jornada when operations is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "hoy", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(calls.respond, 1);
  });

  it("routes mis turnos to upcoming assignments handler", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "buildUpcomingAssignmentsMessage", async () => "UPCOMING_OK");

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "mis turnos" }),
      handlers,
    );

    assert.match(response, /UPCOMING_OK/);
  });

  it("confirms attendance for a single upcoming assignment", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "listConfirmableAssignments", async () => [
      {
        operationId,
        serviceName: "Carrefour Palermo",
        serviceAddress: "Av. Santa Fe 1234",
        serviceLatitude: -34.6,
        serviceLongitude: -58.4,
        scheduledStart: "2026-07-08T23:30:00.000Z",
        scheduledEnd: "2026-07-09T06:00:00.000Z",
        operationStatus: "SCHEDULED",
        confirmationStatus: "PENDING",
        attendanceReceivedAt: null,
        attendanceCheckoutAt: null,
        punctualityStatus: null,
      },
    ]);
    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "CONFIRMED_OK",
    }));

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "confirmo asistencia" }),
      handlers,
    );

    assert.match(response, /CONFIRMED_OK/);
  });

  it("handles numeric selection in confirm attendance session", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    const options = [
      {
        operationId,
        serviceName: "Carrefour Palermo",
        scheduledStart: "2026-07-08T23:30:00.000Z",
      },
    ];

    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "SELECTED_CONFIRMED",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_CONFIRM_ATTENDANCE_SELECTION", {
          contextJson: JSON.stringify({ operationOptions: options }),
        }),
      }),
      handlers,
    );

    assert.match(response, /SELECTED_CONFIRMED/);
  });

  it("confirms attendance with explicit selection when only one assignment exists", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    let confirmedOperationId: string | null = null;

    mock.method(employeeWorkdayService, "listConfirmableAssignments", async () => [
      sampleAssignedOperation(),
    ]);
    mock.method(employeeWorkdayService, "confirmAssignment", async (_companyId, _employeeId, invId) => {
      confirmedOperationId = invId;
      return { kind: "ok" as const, message: "CONFIRMED_OK" };
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "confirmar 1" }),
      handlers,
    );

    assert.match(response, /CONFIRMED_OK/);
    assert.equal(confirmedOperationId, operationId);
  });

  it("returns invalid selection for explicit out-of-range confirm with one assignment", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    let confirmCalls = 0;
    let sessionCalls = 0;

    mock.method(employeeWorkdayService, "listConfirmableAssignments", async () => [
      sampleAssignedOperation(),
    ]);
    mock.method(employeeWorkdayService, "confirmAssignment", async () => {
      confirmCalls += 1;
      return { kind: "ok" as const, message: "SHOULD_NOT_CONFIRM" };
    });
    mock.method(botSessionService, "createConfirmAttendanceSelectionSession", async () => {
      sessionCalls += 1;
      return buildSession("WAITING_CONFIRM_ATTENDANCE_SELECTION");
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "confirmar 2" }),
      handlers,
    );

    assert.match(response, new RegExp(INVALID_SELECTION_MESSAGE));
    assert.equal(confirmCalls, 0);
    assert.equal(sessionCalls, 0);
  });

  it("marks unavailable with explicit selection when only one assignment exists", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    let unavailableOperationId: string | null = null;

    mock.method(employeeWorkdayService, "listUnavailabilityAssignments", async () => [
      sampleAssignedOperation(),
    ]);
    mock.method(
      employeeWorkdayService,
      "markAssignmentUnavailable",
      async (_companyId, _employeeId, invId) => {
        unavailableOperationId = invId;
        return { kind: "ok" as const, message: "UNAVAILABLE_OK" };
      },
    );

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "no puedo turno 1" }),
      handlers,
    );

    assert.match(response, /UNAVAILABLE_OK/);
    assert.equal(unavailableOperationId, operationId);
  });

  it("returns invalid selection for explicit out-of-range unavailability with one assignment", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    let unavailableCalls = 0;
    let sessionCalls = 0;

    mock.method(employeeWorkdayService, "listUnavailabilityAssignments", async () => [
      sampleAssignedOperation(),
    ]);
    mock.method(employeeWorkdayService, "markAssignmentUnavailable", async () => {
      unavailableCalls += 1;
      return { kind: "ok" as const, message: "SHOULD_NOT_MARK" };
    });
    mock.method(botSessionService, "createUnavailabilitySelectionSession", async () => {
      sessionCalls += 1;
      return buildSession("WAITING_UNAVAILABILITY_SELECTION");
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "no puedo turno 2" }),
      handlers,
    );

    assert.match(response, new RegExp(INVALID_SELECTION_MESSAGE));
    assert.equal(unavailableCalls, 0);
    assert.equal(sessionCalls, 0);
  });

  it("returns invalid selection for explicit out-of-range confirm with multiple assignments", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    let confirmCalls = 0;
    let sessionCalls = 0;

    mock.method(employeeWorkdayService, "listConfirmableAssignments", async () => [
      sampleAssignedOperation(),
      sampleAssignedOperation("00000000-0000-4000-8000-000000000099"),
    ]);
    mock.method(employeeWorkdayService, "confirmAssignment", async () => {
      confirmCalls += 1;
      return { kind: "ok" as const, message: "SHOULD_NOT_CONFIRM" };
    });
    mock.method(botSessionService, "createConfirmAttendanceSelectionSession", async () => {
      sessionCalls += 1;
      return buildSession("WAITING_CONFIRM_ATTENDANCE_SELECTION");
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "confirmar 3" }),
      handlers,
    );

    assert.match(response, new RegExp(INVALID_SELECTION_MESSAGE));
    assert.equal(confirmCalls, 0);
    assert.equal(sessionCalls, 0);
  });

  it("blocks confirm attendance when operations is disabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    let listCalls = 0;

    mock.method(employeeWorkdayService, "listConfirmableAssignments", async () => {
      listCalls += 1;
      return [];
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "confirmo asistencia", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(listCalls, 0);
  });

  it("blocks report unavailability when operations is disabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    let listCalls = 0;

    mock.method(employeeWorkdayService, "listUnavailabilityAssignments", async () => {
      listCalls += 1;
      return [];
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "no puedo asistir", moduleStates: states }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(listCalls, 0);
  });

  it("blocks numeric confirm selection when operations is disabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    let confirmCalls = 0;
    let completeCalls = 0;

    mock.method(employeeWorkdayService, "confirmAssignment", async () => {
      confirmCalls += 1;
      return { kind: "ok" as const, message: "SHOULD_NOT_CONFIRM" };
    });
    mock.method(botSessionService, "completeSession", async () => {
      completeCalls += 1;
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        moduleStates: states,
        session: buildSession("WAITING_CONFIRM_ATTENDANCE_SELECTION", {
          contextJson: JSON.stringify({
            operationOptions: [
              {
                operationId,
                serviceName: "Carrefour Palermo",
                scheduledStart: "2026-07-08T23:30:00.000Z",
              },
            ],
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(confirmCalls, 0);
    assert.equal(completeCalls, 0);
  });

  it("blocks numeric unavailability selection when operations is disabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    let unavailableCalls = 0;
    let completeCalls = 0;

    mock.method(employeeWorkdayService, "markAssignmentUnavailable", async () => {
      unavailableCalls += 1;
      return { kind: "ok" as const, message: "SHOULD_NOT_MARK" };
    });
    mock.method(botSessionService, "completeSession", async () => {
      completeCalls += 1;
    });

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        moduleStates: states,
        session: buildSession("WAITING_UNAVAILABILITY_SELECTION", {
          contextJson: JSON.stringify({
            operationOptions: [
              {
                operationId,
                serviceName: "Carrefour Palermo",
                scheduledStart: "2026-07-08T23:30:00.000Z",
              },
            ],
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, new RegExp(MODULE_DISABLED_MESSAGE));
    assert.equal(unavailableCalls, 0);
    assert.equal(completeCalls, 0);
  });
});

describe("whatsappRouterService numeric menu selection", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("routes 1 to check-in when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "1" }),
      handlers,
    );

    assert.match(response, /CHECKIN_STARTED/);
    assert.equal(calls.startCheckIn, 1);
  });

  it("routes 2 to checkout when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "2" }),
      handlers,
    );

    assert.match(response, /CHECKOUT_STARTED/);
    assert.equal(calls.startCheckout, 1);
  });

  it("routes 3 to absence when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { absenceBotService } = await import("../absence-bot.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    let absenceStarted = 0;

    mock.method(absenceBotService, "startAbsenceFlow", async () => {
      absenceStarted += 1;
      return "<Response><Message>ABSENCE_STARTED</Message></Response>";
    });
    mock.method(absenceBotService, "hasActiveAttendanceSession", () => false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "3" }),
      handlers,
    );

    assert.match(response, /ABSENCE_STARTED/);
    assert.equal(absenceStarted, 1);
  });

  it("routes 4 to workday when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "buildTodayWorkdayMessage", async () => "WORKDAY_OK");

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "4" }),
      handlers,
    );

    assert.match(response, /WORKDAY_OK/);
  });

  it("routes 5 to upcoming assignments when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "buildUpcomingAssignmentsMessage", async () => "UPCOMING_OK");

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "5" }),
      handlers,
    );

    assert.match(response, /UPCOMING_OK/);
  });

  it("routes 6 to confirm attendance when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "listConfirmableAssignments", async () => []);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "6" }),
      handlers,
    );

    assert.match(response, /No tenés trabajos próximos para confirmar asistencia/);
  });

  it("routes 7 to report unavailability when all modules are enabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "listUnavailabilityAssignments", async () => []);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "7" }),
      handlers,
    );

    assert.match(response, /No tenés trabajos próximos para reportar no disponibilidad/);
  });

  it("routes 3 to workday when absences is disabled", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ABSENCES, false);

    mock.method(employeeWorkdayService, "buildTodayWorkdayMessage", async () => "WORKDAY_OK");

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "3", moduleStates: states }),
      handlers,
    );

    assert.match(response, /WORKDAY_OK/);
  });

  it("returns invalid menu message for out-of-range numeric option", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const { INVALID_MENU_SELECTION_PREFIX } = await import("../bot/bot-menu-options");

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "9" }),
      handlers,
    );

    assert.match(response, new RegExp(INVALID_MENU_SELECTION_PREFIX));
    assert.match(response, /1\. Marcar llegada/);
    assert.equal(calls.startCheckIn, 0);
  });

  it("keeps operation selection during WAITING_OPERATION_SELECTION", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_OPERATION_SELECTION"),
      }),
      handlers,
    );

    assert.match(response, /OPERATION_SELECTED/);
    assert.equal(calls.handleOperationSelection, 1);
    assert.equal(calls.startCheckIn, 0);
  });

  it("keeps checkout operation selection during WAITING_CHECKOUT_OPERATION_SELECTION", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_CHECKOUT_OPERATION_SELECTION"),
      }),
      handlers,
    );

    assert.match(response, /CHECKOUT_OPERATION_SELECTED/);
    assert.equal(calls.handleCheckoutOperationSelection, 1);
    assert.equal(calls.startCheckout, 0);
  });

  it("routes 1 to checkout when operations is disabled", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "1", moduleStates: states }),
      handlers,
    );

    assert.match(response, /CHECKOUT_STARTED/);
    assert.equal(calls.startCheckout, 1);
    assert.equal(calls.startCheckIn, 0);
  });

  it("routes 2 to absence when operations is disabled", async () => {
    setupUnitTestEnv();
    const { absenceBotService } = await import("../absence-bot.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.OPERATIONS, false);
    let absenceStarted = 0;

    mock.method(absenceBotService, "startAbsenceFlow", async () => {
      absenceStarted += 1;
      return "<Response><Message>ABSENCE_STARTED</Message></Response>";
    });
    mock.method(absenceBotService, "hasActiveAttendanceSession", () => false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "2", moduleStates: states }),
      handlers,
    );

    assert.match(response, /ABSENCE_STARTED/);
    assert.equal(absenceStarted, 1);
  });

  it("routes 1 to absence when attendance is disabled", async () => {
    setupUnitTestEnv();
    const { absenceBotService } = await import("../absence-bot.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const states = enabledStates();
    states.set(COMPANY_MODULE_KEYS.ATTENDANCE, false);
    let absenceStarted = 0;

    mock.method(absenceBotService, "startAbsenceFlow", async () => {
      absenceStarted += 1;
      return "<Response><Message>ABSENCE_STARTED</Message></Response>";
    });
    mock.method(absenceBotService, "hasActiveAttendanceSession", () => false);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({ body: "1", moduleStates: states }),
      handlers,
    );

    assert.match(response, /ABSENCE_STARTED/);
    assert.equal(absenceStarted, 1);
    assert.equal(calls.startCheckIn, 0);
    assert.equal(calls.startCheckout, 0);
  });

  it("keeps confirm attendance selection during WAITING_CONFIRM_ATTENDANCE_SELECTION", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const options = [
      {
        operationId,
        serviceName: "Carrefour Palermo",
        scheduledStart: "2026-07-08T23:30:00.000Z",
      },
    ];

    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "SELECTED_CONFIRMED",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_CONFIRM_ATTENDANCE_SELECTION", {
          contextJson: JSON.stringify({ operationOptions: options }),
        }),
      }),
      handlers,
    );

    assert.match(response, /SELECTED_CONFIRMED/);
    assert.equal(calls.startCheckIn, 0);
  });

  it("keeps unavailability selection during WAITING_UNAVAILABILITY_SELECTION", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();
    const options = [
      {
        operationId,
        serviceName: "Carrefour Palermo",
        scheduledStart: "2026-07-08T23:30:00.000Z",
      },
    ];

    mock.method(employeeWorkdayService, "markAssignmentUnavailable", async () => ({
      kind: "ok" as const,
      message: "SELECTED_UNAVAILABLE",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "1",
        session: buildSession("WAITING_UNAVAILABILITY_SELECTION", {
          contextJson: JSON.stringify({ operationOptions: options }),
        }),
      }),
      handlers,
    );

    assert.match(response, /SELECTED_UNAVAILABLE/);
    assert.equal(calls.startCheckIn, 0);
  });

  it("confirms exact operation during WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { companyOperationalSettingsService } = await import("../company-operational-settings.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    mock.method(companyOperationalSettingsService, "getCompanyOperationalSettings", async () => ({
      companyId,
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: 150,
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 30,
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
    }));

    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "CONTEXT_CONFIRMED",
    }));
    mock.method(employeeWorkdayService, "getAssignmentForResponseMessage", async () => ({
      serviceName: "Carrefour Caballito",
      scheduledStart: "2026-07-15T23:30:00.000Z",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "sí",
        session: buildSession("WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", {
          contextJson: JSON.stringify({
            attendanceConfirmation: {
              operationId,
              employeeId,
              notificationId: "notif-1",
              scheduleVersion: 1,
            },
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, /Asistencia confirmada/);
    assert.equal(calls.startCheckIn, 0);
  });

  it("marks unavailable during WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { companyOperationalSettingsService } = await import("../company-operational-settings.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers, calls } = createMockHandlers();

    mock.method(companyOperationalSettingsService, "getCompanyOperationalSettings", async () => ({
      companyId,
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: 150,
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 30,
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
    }));

    mock.method(employeeWorkdayService, "markAssignmentUnavailable", async () => ({
      kind: "ok" as const,
      message: "CONTEXT_UNAVAILABLE",
    }));
    mock.method(employeeWorkdayService, "getAssignmentForResponseMessage", async () => ({
      serviceName: "Carrefour Caballito",
      scheduledStart: "2026-07-15T23:30:00.000Z",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "no puedo",
        session: buildSession("WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", {
          contextJson: JSON.stringify({
            attendanceConfirmation: {
              operationId,
              employeeId,
              notificationId: "notif-1",
              scheduleVersion: 1,
            },
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, /no vas a poder asistir/);
    assert.match(response, /servicio asignado/);
    assert.doesNotMatch(response, /inventario/i);
    assert.equal(calls.startCheckIn, 0);
  });

  it("uses servicio terminology when assignment is no longer available", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "not_found" as const,
      message: "NOT_FOUND",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "sí",
        session: buildSession("WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", {
          contextJson: JSON.stringify({
            attendanceConfirmation: {
              operationId,
              employeeId,
              notificationId: "notif-1",
              scheduleVersion: 1,
            },
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, /servicio/);
    assert.doesNotMatch(response, /inventario/i);
  });

  it("keeps contextual flow for ambiguous reply during WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", async () => {
    setupUnitTestEnv();
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "tal vez",
        session: buildSession("WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", {
          contextJson: JSON.stringify({
            attendanceConfirmation: {
              operationId,
              employeeId,
              notificationId: "notif-1",
              scheduleVersion: 1,
            },
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, /No pude interpretar tu respuesta/);
    assert.match(response, /1 - Confirmar asistencia/);
  });

  it("formats contextual confirmation reply using company timezone", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { companyOperationalSettingsService } = await import("../company-operational-settings.service");
    const { whatsappRouterService } = await import("./whatsapp-router.service");
    const { handlers } = createMockHandlers();

    mock.method(companyOperationalSettingsService, "getCompanyOperationalSettings", async () => ({
      companyId,
      operationTimezone: "America/Cancun",
      defaultRadiusMeters: 150,
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 30,
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
    }));
    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "CONTEXT_CONFIRMED",
    }));
    mock.method(employeeWorkdayService, "getAssignmentForResponseMessage", async () => ({
      serviceName: "Carrefour Caballito",
      scheduledStart: "2026-07-15T23:30:00.000Z",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const response = await whatsappRouterService.routeTextMessage(
      baseContext({
        body: "sí",
        session: buildSession("WAITING_ATTENDANCE_CONFIRMATION_RESPONSE", {
          contextJson: JSON.stringify({
            attendanceConfirmation: {
              operationId,
              employeeId,
              notificationId: "notif-1",
              scheduleVersion: 1,
            },
          }),
        }),
      }),
      handlers,
    );

    assert.match(response, /15\/07\/2026/);
    assert.match(response, /18:30/);
  });
});
