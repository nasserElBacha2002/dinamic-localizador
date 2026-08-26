import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { CONFIRMATION_EXPIRED_USER_MESSAGE } from "../../utils/attendance-confirmation-validity";
import { runWithBotRuntimeContext, type BotRuntimeContext } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { BotSession } from "../../types/twilio.types";

const companyId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const operationId = "00000000-0000-4000-8000-000000000003";
const assignmentId = "00000000-0000-4000-8000-000000000004";
const notificationId = "00000000-0000-4000-8000-000000000005";

const withNow = async <T>(now: Date, fn: () => Promise<T>): Promise<T> => {
  const context: BotRuntimeContext = {
    simulationSessionId: "sim-confirm",
    employeeIdOverride: employeeId,
    phoneNumber: "+5491111111111",
    simulatedNow: now,
    mode: "dry-run",
    skipWhatsAppPersistence: true,
    messages: [],
    technicalDetails: {},
    simulationArtifacts: [],
    virtualAttendanceRecords: [],
    lastBotResponse: null,
    lastDetectedIntent: null,
    lastTwilioPayload: null,
  };
  return runWithBotRuntimeContext(context, fn);
};

const baseContext = (overrides: Partial<WhatsAppRouterContext> = {}): WhatsAppRouterContext => ({
  companyId,
  employeeId,
  payload: {
    MessageSid: "SM-CONFIRM-1",
    From: "whatsapp:+5491111111111",
    To: "whatsapp:+10000000000",
    Body: "1",
  },
  messageType: "TEXT",
  phoneFrom: "+5491111111111",
  phoneTo: "whatsapp:+10000000000",
  moduleStates: new Map(),
  session: null,
  recentlyExpired: false,
  body: "1",
  ...overrides,
});

const createHandlers = () => {
  const calls: Array<{ message: string; resultCode?: string }> = [];
  const handlers: WhatsAppRouterHandlers = {
    respond: async (_cid, input) => {
      calls.push({ message: input.message, resultCode: input.resultCode });
      return `<Response><Message>${input.message}</Message></Response>`;
    },
    startCheckIn: async () => "<Response/>",
    startCheckout: async () => "<Response/>",
    handleOperationSelection: async () => "<Response/>",
    handleCheckoutOperationSelection: async () => "<Response/>",
    processLocationCheckIn: async () => "<Response/>",
    processLocationCheckout: async () => "<Response/>",
    processDirectLocationAttendance: async () => "<Response/>",
  };
  return { handlers, calls };
};

describe("attendance confirmation response handler", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("confirms via durable open-window target after conversational TTL", async () => {
    setupUnitTestEnv();
    const { attendanceNotificationRepository } = await import(
      "../../repositories/attendance-notification.repository"
    );
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { handleDurableAttendanceConfirmationReply } = await import(
      "./attendance-confirmation-response.handler"
    );

    mock.method(attendanceNotificationRepository, "findConfirmationReplyTarget", async () => ({
      kind: "eligible_pending" as const,
      notificationId,
      operationId,
      assignmentId,
      employeeId,
      scheduledStart: "2026-08-26T22:00:00.000Z",
      scheduleVersion: 2,
      confirmationStatus: "PENDING" as const,
      sentAt: "2026-08-26T19:00:00.000Z",
    }));
    const confirmMock = mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "ok",
    }));
    mock.method(employeeWorkdayService, "getAssignmentForResponseMessage", async () => ({
      assignmentId,
      operationId,
      operationKind: "ONE_TIME" as const,
      operationWorkdayId: null,
      employeeWorkdayId: null,
      serviceName: "Local Centro",
      serviceAddress: null,
      serviceLocality: "CABA",
      serviceLatitude: null,
      serviceLongitude: null,
      scheduledStart: "2026-08-26T22:00:00.000Z",
      scheduledEnd: null,
      confirmationStatus: "CONFIRMED" as const,
    }));
    mock.method(
      (await import("../company-operational-settings.service")).companyOperationalSettingsService,
      "getCompanyOperationalSettings",
      async () => ({ operationTimezone: "America/Argentina/Buenos_Aires" }),
    );

    const { handlers, calls } = createHandlers();
    const response = await withNow(new Date("2026-08-26T19:30:00.000Z"), async () =>
      handleDurableAttendanceConfirmationReply(baseContext({ body: "1" }), handlers),
    );

    assert.ok(response);
    assert.equal(confirmMock.mock.callCount(), 1);
    assert.equal(calls[0]?.resultCode, WHATSAPP_RESULT_CODES.ATTENDANCE_CONFIRMATION_CONFIRMED);
  });

  it("does not intercept numeric reply from historical PENDING alone", async () => {
    setupUnitTestEnv();
    const { attendanceNotificationRepository } = await import(
      "../../repositories/attendance-notification.repository"
    );
    const { handleDurableAttendanceConfirmationReply } = await import(
      "./attendance-confirmation-response.handler"
    );

    mock.method(attendanceNotificationRepository, "findConfirmationReplyTarget", async () => null);

    const { handlers, calls } = createHandlers();
    const response = await withNow(new Date("2026-08-26T23:00:00.000Z"), async () =>
      handleDurableAttendanceConfirmationReply(
        baseContext({ body: "1", recentlyExpired: false }),
        handlers,
      ),
    );

    assert.equal(response, null);
    assert.equal(calls.length, 0);
  });

  it("returns CONFIRMATION_EXPIRED only with expired confirmation session context", async () => {
    setupUnitTestEnv();
    const { attendanceNotificationRepository } = await import(
      "../../repositories/attendance-notification.repository"
    );
    const { botSessionService } = await import("../bot-session.service");
    const { handleDurableAttendanceConfirmationReply } = await import(
      "./attendance-confirmation-response.handler"
    );

    mock.method(
      attendanceNotificationRepository,
      "findConfirmationReplyTarget",
      async (_c, _e, _n, options?: { onlyExpired?: boolean }) => {
        if (!options?.onlyExpired) {
          return null;
        }
        return {
          kind: "expired_pending" as const,
          notificationId,
          operationId,
          assignmentId,
          employeeId,
          scheduledStart: "2026-08-26T22:00:00.000Z",
          scheduleVersion: 1,
          confirmationStatus: "PENDING" as const,
          sentAt: "2026-08-26T19:00:00.000Z",
        };
      },
    );
    mock.method(botSessionService, "getLatestSessionByPhone", async () => ({
      id: "session-1",
      companyId,
      employeeId,
      operationId,
      employeeWorkdayId: null,
      attendanceRecordId: null,
      phoneNumber: "+5491111111111",
      state: "EXPIRED" as const,
      contextJson: JSON.stringify({
        attendanceConfirmation: { operationId, scheduleVersion: 1, notificationId },
      }),
      expiresAt: "2026-08-26T19:15:00.000Z",
      createdAt: "2026-08-26T19:00:00.000Z",
      updatedAt: "2026-08-26T19:15:00.000Z",
      sessionVersion: 0,
      lastMessageSid: null,
    }));
    mock.method(botSessionService, "parseContext", (json: string | null) =>
      json ? JSON.parse(json) : {},
    );

    const { handlers, calls } = createHandlers();
    const response = await withNow(new Date("2026-08-26T22:05:00.000Z"), async () =>
      handleDurableAttendanceConfirmationReply(
        baseContext({ body: "1", recentlyExpired: true }),
        handlers,
      ),
    );

    assert.ok(response);
    assert.equal(calls[0]?.resultCode, WHATSAPP_RESULT_CODES.CONFIRMATION_EXPIRED);
    assert.equal(calls[0]?.message, CONFIRMATION_EXPIRED_USER_MESSAGE);
  });

  it("is idempotent for a second affirmative reply while window is open", async () => {
    setupUnitTestEnv();
    const { attendanceNotificationRepository } = await import(
      "../../repositories/attendance-notification.repository"
    );
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { handleDurableAttendanceConfirmationReply } = await import(
      "./attendance-confirmation-response.handler"
    );

    mock.method(attendanceNotificationRepository, "findConfirmationReplyTarget", async () => ({
      kind: "confirmed_open" as const,
      notificationId,
      operationId,
      assignmentId,
      employeeId,
      scheduledStart: "2026-08-26T22:00:00.000Z",
      scheduleVersion: 1,
      confirmationStatus: "CONFIRMED" as const,
      sentAt: "2026-08-26T19:00:00.000Z",
    }));
    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "ok" as const,
      message: "already",
    }));
    mock.method(employeeWorkdayService, "getAssignmentForResponseMessage", async () => null);

    const { handlers, calls } = createHandlers();
    await withNow(new Date("2026-08-26T20:00:00.000Z"), async () =>
      handleDurableAttendanceConfirmationReply(baseContext({ body: "1" }), handlers),
    );

    assert.equal(calls[0]?.resultCode, WHATSAPP_RESULT_CODES.ATTENDANCE_CONFIRMATION_CONFIRMED);
  });

  it("active confirmation session uses CONFIRMATION_EXPIRED, not SESSION_EXPIRED copy", async () => {
    setupUnitTestEnv();
    const { employeeWorkdayService } = await import("../employee-workday.service");
    const { botSessionService } = await import("../bot-session.service");
    const { handleActiveAttendanceConfirmationResponseSession } = await import(
      "./attendance-confirmation-response.handler"
    );

    mock.method(employeeWorkdayService, "confirmAssignment", async () => ({
      kind: "past" as const,
      message: "past",
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);
    mock.method(botSessionService, "parseContext", () => ({
      attendanceConfirmation: {
        operationId,
        scheduleVersion: 1,
        validUntil: "2026-08-26T22:00:00.000Z",
      },
    }));

    const session: BotSession = {
      id: "session-1",
      companyId,
      employeeId,
      operationId,
      employeeWorkdayId: null,
      attendanceRecordId: null,
      phoneNumber: "+5491111111111",
      state: "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE",
      contextJson: "{}",
      expiresAt: "2026-08-26T19:15:00.000Z",
      createdAt: "2026-08-26T19:00:00.000Z",
      updatedAt: "2026-08-26T19:00:00.000Z",
      sessionVersion: 0,
      lastMessageSid: null,
    };

    const { handlers, calls } = createHandlers();
    await withNow(new Date("2026-08-26T22:05:00.000Z"), async () =>
      handleActiveAttendanceConfirmationResponseSession(
        baseContext({ body: "1", session }),
        session,
        handlers,
      ),
    );

    assert.equal(calls[0]?.resultCode, WHATSAPP_RESULT_CODES.CONFIRMATION_EXPIRED);
  });
});
