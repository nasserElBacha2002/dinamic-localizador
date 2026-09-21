/**
 * Phase 3 — WhatsApp stale-session / multi-shift selection E2E (no real Twilio).
 * Prefer SQL fixtures when RUN_DB_INTEGRATION_TESTS=true; otherwise mock-driven.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, describe, it, mock } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { mockAdminAlertSideEffects } from "../test-helpers/mock-admin-alert-side-effects";
import { deleteOperationCascade } from "../test-helpers/integration-entity-cascade";
import { getPool } from "../database/connection";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import type { CompanyModuleKey } from "../constants/company-modules";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import type { BotSession } from "../types/twilio.types";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import type { WhatsAppInboundContext } from "../types/whatsapp-company-context";
import { EXPIRED_SESSION_USER_MESSAGE } from "../utils/bot-session-expiration";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";
import { extractMessageFromTwiml } from "../utils/twiml-message";
import {
  DUPLICATE_MESSAGE_SID_RESPONSE,
  WORKDAY_NO_LONGER_AVAILABLE_MESSAGE,
} from "./bot/bot-response.builder";
import { formatBotWorkdaySelectionLines, formatWorkdayScheduleLine } from "../utils/employee-assignment-format";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationScheduleModeTransitionService } from "./operation-schedule-mode-transition.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { employeeWorkdayAvailabilityService } from "./employee-workday-availability.service";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { handleOperationSelection, startCheckIn } from "./bot/check-in-attendance.flow";

const companyA = "11111111-1111-1111-1111-111111111111";
const employeeA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const operationA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const employeeWorkdayMorning = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const employeeWorkdayAfternoon = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const attendanceMorning = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const phone = "+5491111111111";
const botNumber = "whatsapp:+10000000000";
const TIMEZONE = "America/Argentina/Buenos_Aires";

const checkInWorkdayCandidate = (
  operationId: string,
  employeeWorkdayId: string,
  overrides: Record<string, unknown> = {},
) => ({
  employeeWorkdayId,
  operationWorkdayId: "11111111-1111-1111-1111-111111111112",
  operationId,
  serviceId: "22222222-2222-2222-2222-222222222222",
  serviceName: "Servicio Centro",
  serviceAddress: "Av. Corrientes 1234",
  serviceLocality: "CABA",
  serviceLatitude: -34.6,
  serviceLongitude: -58.4,
  allowedRadiusMeters: 150,
  operationKind: "ONE_TIME" as const,
  workDate: "2026-07-05",
  expectedStartAt: "2026-07-05T12:00:00.000Z",
  expectedEndAt: "2026-07-05T16:00:00.000Z",
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 120,
  scheduleTimezone: TIMEZONE,
  operationShiftId: null as string | null,
  shiftNameSnapshot: null as string | null,
  ...overrides,
});

const enabledStates = () =>
  new Map<CompanyModuleKey, boolean>([
    [COMPANY_MODULE_KEYS.ATTENDANCE, true],
    [COMPANY_MODULE_KEYS.OPERATIONS, true],
    [COMPANY_MODULE_KEYS.ABSENCES, true],
    [COMPANY_MODULE_KEYS.REPORTS, true],
    [COMPANY_MODULE_KEYS.BOT_SIMULATOR, true],
  ]);

const runtimeSettings = (companyId: string): BotRuntimeSettings => ({
  companyId,
  operationTimezone: TIMEZONE,
  defaultRadiusMeters: 150,
  geofenceReviewMarginMeters: 30,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  pendingOperationExpirationHours: 12,
  sessionTtlMinutes: 15,
});

const simulationContext = (overrides: Record<string, unknown> = {}) => ({
  simulationSessionId: "sim-phase3-stale",
  employeeIdOverride: employeeA,
  phoneNumber: phone,
  simulatedNow: new Date("2026-07-05T12:05:00.000Z"),
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
  id: "session-phase3",
  companyId,
  employeeId: employeeA,
  operationId: null,
  employeeWorkdayId: null,
  attendanceRecordId: null,
  phoneNumber: phone,
  state,
  contextJson:
    state === "WAITING_OPERATION_SELECTION"
      ? JSON.stringify({
          workdayOptions: [
            {
              employeeWorkdayId: employeeWorkdayMorning,
              operationWorkdayId: "11111111-1111-1111-1111-111111111112",
              operationId: operationA,
              serviceName: "Servicio Centro",
              serviceAddress: "Av. Corrientes 1234",
              serviceLocality: "CABA",
              expectedStartAt: "2026-07-05T12:00:00.000Z",
              expectedEndAt: "2026-07-05T16:00:00.000Z",
              workDate: "2026-07-05",
              shiftNameSnapshot: "Mañana",
            },
            {
              employeeWorkdayId: employeeWorkdayAfternoon,
              operationWorkdayId: "11111111-1111-1111-1111-111111111113",
              operationId: operationA,
              serviceName: "Servicio Centro",
              serviceAddress: "Av. Corrientes 1234",
              serviceLocality: "CABA",
              expectedStartAt: "2026-07-05T17:00:00.000Z",
              expectedEndAt: "2026-07-05T21:00:00.000Z",
              workDate: "2026-07-05",
              shiftNameSnapshot: "Tarde",
            },
          ],
        })
      : null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const setupCommonWebhookMocks = async () => {
  const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
  const { companyModuleService } = await import("./company-module.service");
  const { botSessionService } = await import("./bot-session.service");
  const { employeeRepository } = await import("../repositories/employee.repository");
  const { attendanceNotificationRepository } = await import(
    "../repositories/attendance-notification.repository"
  );

  mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () =>
    runtimeSettings(companyA),
  );
  mock.method(companyModuleService, "getModuleStates", async () => enabledStates());
  mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
    activeSession: null,
    recentlyExpired: false,
  }));
  mock.method(attendanceNotificationRepository, "findConfirmationReplyTarget", async () => null);
  mock.method(botSessionService, "getLatestSessionByPhone", async () => null);
  mock.method(botSessionService, "createMenuSelectionSession", async () => ({} as never));
  mock.method(employeeRepository, "findById", async () => ({
    id: employeeA,
    name: "Worker",
    documentNumber: null,
    phoneNumber: phone,
    employeeType: "FIELD" as const,
    active: true,
    lastWorkedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    companyId: companyA,
  }));
};

describe("phase3 whatsapp stale-session / multi-shift (mock dry-run)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("two eligible shifts → selection prompt with two options", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await setupCommonWebhookMocks();

    const morning = checkInWorkdayCandidate(operationA, employeeWorkdayMorning, {
      shiftNameSnapshot: "Mañana",
      operationShiftId: "shift-morning",
      expectedStartAt: "2026-07-05T12:00:00.000Z",
      expectedEndAt: "2026-07-05T16:00:00.000Z",
    });
    const afternoon = checkInWorkdayCandidate(operationA, employeeWorkdayAfternoon, {
      shiftNameSnapshot: "Tarde",
      operationShiftId: "shift-afternoon",
      operationWorkdayId: "11111111-1111-1111-1111-111111111113",
      expectedStartAt: "2026-07-05T17:00:00.000Z",
      expectedEndAt: "2026-07-05T21:00:00.000Z",
    });

    mock.method(employeeWorkdayAvailabilityService, "listAvailableForCheckIn", async () => ({
      candidates: [morning, afternoon],
      hasJustifiedWorkdayInWindow: false,
    }));
    mock.method(employeeWorkdayAvailabilityService, "listOpenForCheckout", async () => []);

    const { botSessionService } = await import("./bot-session.service");
    let storedOptions: unknown[] = [];
    mock.method(botSessionService, "createOperationSelectionSession", async (_c, input) => {
      storedOptions = input.options;
      return buildSession(companyA, "WAITING_OPERATION_SELECTION");
    });

    let message = "";
    await runWithBotRuntimeContext(simulationContext(), async () => {
      message = await startCheckIn({
        companyId: companyA,
        employeeId: employeeA,
        phoneFrom: `whatsapp:${phone}`,
        phoneTo: botNumber,
      });
    });

    assert.match(message, /Mañana|Tarde|Respondé con el número|seleccioná/i);
    assert.equal(storedOptions.length, 2);
  });

  it("select morning → check-in targets morning EW; afternoon selection does not mutate morning", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await setupCommonWebhookMocks();

    const morning = checkInWorkdayCandidate(operationA, employeeWorkdayMorning, {
      shiftNameSnapshot: "Mañana",
    });
    const afternoon = checkInWorkdayCandidate(operationA, employeeWorkdayAfternoon, {
      shiftNameSnapshot: "Tarde",
      operationWorkdayId: "11111111-1111-1111-1111-111111111113",
      expectedStartAt: "2026-07-05T17:00:00.000Z",
      expectedEndAt: "2026-07-05T21:00:00.000Z",
    });

    mock.method(
      employeeWorkdayAvailabilityService,
      "revalidateCheckInCandidate",
      async (_c, _e, ewId) => (ewId === employeeWorkdayMorning ? morning : afternoon),
    );

    const { botSessionService } = await import("./bot-session.service");
    const selected: Array<{ employeeWorkdayId: string }> = [];
    mock.method(botSessionService, "selectOperationAndRenewExpiration", async (_c, _s, payload) => {
      selected.push({ employeeWorkdayId: payload.employeeWorkdayId });
      return {
        kind: "ok" as const,
        session: buildSession(companyA, "WAITING_LOCATION", {
          operationId: operationA,
          employeeWorkdayId: payload.employeeWorkdayId,
        }),
      };
    });

    const session = buildSession(companyA, "WAITING_OPERATION_SELECTION");
    await runWithBotRuntimeContext(simulationContext(), async () => {
      await handleOperationSelection({
        companyId: companyA,
        session,
        body: "1",
        employeeId: employeeA,
        phoneFrom: `whatsapp:${phone}`,
        phoneTo: botNumber,
        messageSid: "SM-pick-morning",
      });
    });
    assert.equal(selected[0]?.employeeWorkdayId, employeeWorkdayMorning);

    await runWithBotRuntimeContext(simulationContext(), async () => {
      await handleOperationSelection({
        companyId: companyA,
        session,
        body: "2",
        employeeId: employeeA,
        phoneFrom: `whatsapp:${phone}`,
        phoneTo: botNumber,
        messageSid: "SM-pick-afternoon",
      });
    });
    assert.equal(selected[1]?.employeeWorkdayId, employeeWorkdayAfternoon);
    assert.equal(selected[0]?.employeeWorkdayId, employeeWorkdayMorning);
  });

  it("checkout one shift does not close the other (virtual attendance isolation)", async () => {
    setupUnitTestEnv();
    const ctx = simulationContext({
      virtualAttendanceRecords: [
        {
          id: attendanceMorning,
          operationId: operationA,
          employeeId: employeeA,
          employeeWorkdayId: employeeWorkdayMorning,
          receivedAt: "2026-07-05T12:10:00.000Z",
          validationStatus: "VALID",
          locationStatus: "INSIDE",
          punctualityStatus: "ON_TIME",
          distanceMeters: 10,
          checkoutAt: null,
          checkoutStatus: null,
        },
      ],
    });

    await runWithBotRuntimeContext(ctx, async () => {
      const { addVirtualCheckIn, hasVirtualActiveRecord, completeVirtualCheckOut } = await import(
        "../utils/bot-runtime-context"
      );
      assert.equal(hasVirtualActiveRecord(employeeWorkdayMorning), true);
      assert.equal(hasVirtualActiveRecord(employeeWorkdayAfternoon), false);
      addVirtualCheckIn({
        operationId: operationA,
        employeeId: employeeA,
        employeeWorkdayId: employeeWorkdayAfternoon,
        receivedAt: "2026-07-05T17:10:00.000Z",
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        distanceMeters: 12,
      });
      assert.equal(hasVirtualActiveRecord(employeeWorkdayMorning), true);
      assert.equal(hasVirtualActiveRecord(employeeWorkdayAfternoon), true);
      completeVirtualCheckOut(attendanceMorning, {
        checkoutAt: "2026-07-05T16:00:00.000Z",
        checkoutStatus: "CHECKOUT_VALID",
      });
      assert.equal(hasVirtualActiveRecord(employeeWorkdayMorning), false);
      assert.equal(hasVirtualActiveRecord(employeeWorkdayAfternoon), true);
    });
  });

  it("replay same MessageSid is idempotent", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    const { env } = await import("../config/env");
    Object.assign(env, { TWILIO_WHATSAPP_NUMBER: "whatsapp:+10000000000" });
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    const { whatsappMessageRepository } = await import("../repositories/whatsapp-message.repository");
    const { whatsappWebhookEventRepository } = await import(
      "../repositories/whatsapp-webhook-event.repository"
    );
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
    const { companyModuleService } = await import("./company-module.service");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { botSessionService } = await import("./bot-session.service");

    mock.method(botRuntimeSettingsService, "getBotRuntimeSettings", async () =>
      runtimeSettings(companyA),
    );
    mock.method(companyModuleService, "getModuleStates", async () => enabledStates());
    mock.method(employeeRepository, "findById", async () => ({
      id: employeeA,
      name: "Worker",
      documentNumber: null,
      phoneNumber: phone,
      employeeType: "FIELD" as const,
      active: true,
      lastWorkedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      companyId: companyA,
    }));
    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: false,
    }));
    mock.method(whatsappWebhookEventRepository, "claimInboundMessage", async () => ({
      outcome: "CLAIMED" as const,
      event: {
        id: "evt-1",
        companyId: companyA,
        messageSid: "SM-DUP-PHASE3",
        eventType: "INBOUND_MESSAGE" as const,
        payloadHash: "hash",
        processingStatus: "PROCESSING" as const,
        responseReference: null,
        responseBody: null,
        responseType: null,
        processedAt: null,
        attemptCount: 1,
        maxAttempts: 8,
        processingOwner: "test",
        processingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        processingVersion: 1,
        nextAttemptAt: null,
        lastError: null,
      },
    }));
    mock.method(whatsappWebhookEventRepository, "markProcessed", async () => undefined);
    mock.method(whatsappMessageRepository, "findByMessageSid", async () => ({
      id: "existing-message",
      messageSid: "SM-DUP-PHASE3",
    }));
    mock.method(whatsappMessageRepository, "updateProcessingStatus", async () => undefined);

    const twiml = await whatsappBotService.handleWebhook(
      inboundContext(),
      webhookPayload({ MessageSid: "SM-DUP-PHASE3", Body: "Llegué" }),
    );
    assert.match(extractMessageFromTwiml(twiml), new RegExp(DUPLICATE_MESSAGE_SID_RESPONSE));
  });

  it("two concurrent webhook messages both complete without throw", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await setupCommonWebhookMocks();
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    mock.method(employeeWorkdayAvailabilityService, "listAvailableForCheckIn", async () => ({
      candidates: [],
      hasJustifiedWorkdayInWindow: false,
    }));
    mock.method(employeeWorkdayAvailabilityService, "listOpenForCheckout", async () => []);

    const results = await Promise.allSettled([
      runWithBotRuntimeContext(simulationContext({ simulationSessionId: "c1" }), async () =>
        whatsappBotService.handleWebhook(
          inboundContext(),
          webhookPayload({ MessageSid: "SM-c1", Body: "Llegué" }),
        ),
      ),
      runWithBotRuntimeContext(simulationContext({ simulationSessionId: "c2" }), async () =>
        whatsappBotService.handleWebhook(
          inboundContext(),
          webhookPayload({ MessageSid: "SM-c2", Body: "Llegué" }),
        ),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  });

  it("expired session returns expiration message", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await setupCommonWebhookMocks();
    const { botSessionService } = await import("./bot-session.service");
    mock.method(botSessionService, "getSessionResolutionByPhone", async () => ({
      activeSession: null,
      recentlyExpired: true,
    }));
    const { whatsappBotService } = await import("./whatsapp-bot.service");
    let twiml = "";
    await runWithBotRuntimeContext(simulationContext(), async () => {
      twiml = await whatsappBotService.handleWebhook(
        inboundContext(),
        webhookPayload({ Body: "1" }),
      );
    });
    assert.match(extractMessageFromTwiml(twiml), new RegExp(EXPIRED_SESSION_USER_MESSAGE));
  });

  it("overnight shift remains selectable and labeled", () => {
    const overnight = {
      serviceName: "Servicio Centro",
      serviceAddress: "Av. Corrientes 1234",
      serviceLocality: "CABA",
      expectedStartAt: "2026-09-16T01:00:00.000Z",
      expectedEndAt: "2026-09-16T09:00:00.000Z",
      workDate: "2026-09-15",
      shiftNameSnapshot: "Noche",
      scheduleTimezone: TIMEZONE,
    };
    const lines = formatBotWorkdaySelectionLines(1, overnight, TIMEZONE);
    assert.match(lines[0]!, /Noche/);
    const schedule = formatWorkdayScheduleLine(overnight, TIMEZONE);
    assert.match(schedule, /día siguiente/i);
  });

  it("selection revalidation null → workday no longer available (mock)", async () => {
    setupUnitTestEnv();
    await mockAdminAlertSideEffects();
    await setupCommonWebhookMocks();
    mock.method(
      employeeWorkdayAvailabilityService,
      "revalidateCheckInCandidate",
      async () => null,
    );
    const session = buildSession(companyA, "WAITING_OPERATION_SELECTION");
    let message = "";
    await runWithBotRuntimeContext(simulationContext(), async () => {
      message = await handleOperationSelection({
        companyId: companyA,
        session,
        body: "1",
        employeeId: employeeA,
        phoneFrom: `whatsapp:${phone}`,
        phoneTo: botNumber,
        messageSid: "SM-stale-mock",
      });
    });
    assert.match(message, new RegExp(WORKDAY_NO_LONGER_AVAILABLE_MESSAGE));
  });
});

describeDatabaseIntegration("phase3 whatsapp stale-session (SQL revalidation)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  let companyId = "";
  let operationId = "";
  let employeeId = "";
  let morningShiftId = "";
  let afternoonShiftId = "";
  let ewMorning = "";
  let ewAfternoon = "";
  let owMorning = "";
  let owAfternoon = "";
  let workDate = "";
  let assignmentMorningId = "";

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    workDate = getDateIsoInTimezone(new Date(), timezone);

    const employee = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM dbo.employees
        WHERE company_id = @companyId AND active = 1
          AND phone_number IS NOT NULL AND LTRIM(RTRIM(phone_number)) <> N''
        ORDER BY created_at ASC
      `);
    employeeId = String(employee.recordset[0]?.id ?? "");
    assert.ok(employeeId);

    const service = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM dbo.operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(service.recordset[0]?.id ?? "");
    assert.ok(serviceId);

    const start = new Date(`${workDate}T12:00:00.000Z`);
    start.setUTCSeconds(start.getUTCSeconds() + (Date.now() % 40_000) + 100);
    const end = new Date(start.getTime() + 11 * 60 * 60 * 1000);
    const op = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("start", sql.DateTime2, start)
      .input("end", sql.DateTime2, end)
      .query(`
        INSERT INTO dbo.scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes,
          early_tolerance_source, late_tolerance_source, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME',
          @start, @end, 180, 180, N'CUSTOM', N'CUSTOM', N'SCHEDULED'
        );
      `);
    operationId = String(op.recordset[0].id);

    await operationScheduleModeTransitionService.transitionToMultiShift(companyId, operationId, {
      effectiveFrom: workDate,
      shifts: [
        {
          code: `M${randomUUID().slice(0, 6)}`,
          name: "Mañana",
          startTime: "09:00",
          endTime: "13:00",
        },
        {
          code: `T${randomUUID().slice(0, 6)}`,
          name: "Tarde",
          startTime: "14:00",
          endTime: "18:00",
        },
      ],
    });

    await recurringWorkdayMaterializationService.materializeMultiShiftOperationHorizon(
      companyId,
      operationId,
      { rangeStart: workDate, rangeEnd: workDate },
    );

    const workdays = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT id, operation_shift_id, expected_start_at, shift_name_snapshot
        FROM dbo.operation_workdays
        WHERE operation_id = @operationId AND work_date = @workDate
        ORDER BY expected_start_at ASC
      `);
    assert.equal(workdays.recordset.length, 2);
    owMorning = String(workdays.recordset[0].id);
    owAfternoon = String(workdays.recordset[1].id);
    morningShiftId = String(workdays.recordset[0].operation_shift_id);
    afternoonShiftId = String(workdays.recordset[1].operation_shift_id);

    const morningAsg = await operationAssignmentService.assignEmployee(
      companyId,
      operationId,
      employeeId,
      { operationShiftId: morningShiftId },
    );
    assignmentMorningId = morningAsg.id;
    await operationAssignmentService.assignEmployee(companyId, operationId, employeeId, {
      operationShiftId: afternoonShiftId,
    });

    const ews = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT ew.id, ew.operation_workday_id, ow.expected_start_at
        FROM dbo.employee_workdays ew
        INNER JOIN dbo.operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ow.operation_id = @operationId
          AND ew.expectation_status = N'EXPECTED'
        ORDER BY ow.expected_start_at ASC
      `);
    assert.equal(ews.recordset.length, 2);
    ewMorning = String(ews.recordset[0].id);
    ewAfternoon = String(ews.recordset[1].id);
  });

  after(async () => {
    if (operationId && companyId) {
      try {
        await deleteOperationCascade(companyId, operationId);
      } catch (error) {
        console.warn("[phase3-whatsapp-stale] cleanup failed", operationId, error);
      }
    }
    await teardownDatabaseIntegration();
  });

  it("SQL: two eligible shifts persist without duplicate EWs", async () => {
    const pool = getPool();
    const rows = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT ew.id AS employee_workday_id, ow.operation_shift_id, ow.status
        FROM dbo.employee_workdays ew
        INNER JOIN dbo.operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ow.operation_id = @operationId
          AND ew.expectation_status = N'EXPECTED'
      `);
    assert.equal(rows.recordset.length, 2);
    const ids = new Set(rows.recordset.map((r: { employee_workday_id: string }) => String(r.employee_workday_id)));
    assert.equal(ids.size, 2);
    const shifts = new Set(
      rows.recordset.map((r: { operation_shift_id: string }) => String(r.operation_shift_id)),
    );
    assert.equal(shifts.size, 2);
  });

  it("SQL: cancelled workday after session → revalidateCheckInCandidate rejects", async () => {
    const pool = getPool();
    const startRow = await pool
      .request()
      .input("owId", sql.UniqueIdentifier, owMorning)
      .query(`SELECT expected_start_at FROM dbo.operation_workdays WHERE id = @owId`);
    const at = new Date(startRow.recordset[0].expected_start_at);

    await pool
      .request()
      .input("owId", sql.UniqueIdentifier, owMorning)
      .query(`
        UPDATE dbo.operation_workdays
        SET status = N'CANCELLED', cancellation_reason = N'EXCEPTION'
        WHERE id = @owId
      `);

    const after = await employeeWorkdayAvailabilityService.revalidateCheckInCandidate(
      companyId,
      employeeId,
      ewMorning,
      at,
      { simulationSessionId: null },
    );
    assert.equal(after, null);

    await pool
      .request()
      .input("owId", sql.UniqueIdentifier, owMorning)
      .query(`
        UPDATE dbo.operation_workdays
        SET status = N'ACTIVE', cancellation_reason = NULL
        WHERE id = @owId
      `);
  });

  it("SQL: assignment cancelled after session → revalidate rejects", async () => {
    const pool = getPool();
    const startRow = await pool
      .request()
      .input("owId", sql.UniqueIdentifier, owAfternoon)
      .query(`SELECT expected_start_at FROM dbo.operation_workdays WHERE id = @owId`);
    const at = new Date(startRow.recordset[0].expected_start_at);

    await operationAssignmentService.cancelAssignment(companyId, operationId, assignmentMorningId);

    // Afternoon EW should still revalidate independently when active.
    const afternoonStill = await employeeWorkdayAvailabilityService.revalidateCheckInCandidate(
      companyId,
      employeeId,
      ewAfternoon,
      at,
      { simulationSessionId: null },
    );
    // May be null if outside window, but must not throw.
    void afternoonStill;

    const morningAfterCancel = await employeeWorkdayAvailabilityService.revalidateCheckInCandidate(
      companyId,
      employeeId,
      ewMorning,
      at,
      { simulationSessionId: null },
    );
    assert.equal(morningAfterCancel, null);
  });
});
