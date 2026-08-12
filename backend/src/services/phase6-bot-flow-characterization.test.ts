/**
 * Behavioral characterization for Phase 6 checkout command boundary + observability ALS.
 * Complements source-structure guards; does not replace DB integration evidence.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";
import { runWithBotRuntimeSettings } from "../utils/bot-runtime-settings-scope";
import {
  getObservabilityFlowResult,
  runWithObservabilityTrace,
} from "../utils/whatsapp-observability-scope";
import { WHATSAPP_RESULT_CODES } from "../constants/whatsapp-observability";
import {
  GENERIC_ERROR_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  NO_OPERATION_MESSAGE,
} from "./bot/bot-response.builder";

const companyId = "00000000-0000-4000-8000-0000000000aa";
const employeeId = "00000000-0000-4000-8000-0000000000bb";

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

const simulationContext = {
  simulationSessionId: "sim-char",
  employeeIdOverride: employeeId,
  phoneNumber: "+5491111111111",
  simulatedNow: new Date("2026-07-05T15:00:00.000Z"),
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

describe("phase6 bot flow behavioral characterization", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("startCheckIn with 0 workdays returns NO_OPERATION copy (F)", async () => {
    setupUnitTestEnv();
    const { startCheckIn } = await import("./bot/check-in-attendance.flow");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    mock.method(employeeWorkdayAvailabilityService, "listAvailableForCheckIn", async () => ({
      candidates: [],
      hasJustifiedWorkdayInWindow: false,
    }));

    const twiml = await runWithBotRuntimeContext(simulationContext, async () =>
      runWithBotRuntimeSettings(runtimeSettings(), async () =>
        startCheckIn({
          companyId,
          employeeId,
          phoneFrom: "+5491111111111",
          phoneTo: "+5491000000000",
        }),
      ),
    );

    assert.match(twiml, new RegExp(NO_OPERATION_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("invalid checkout selection returns INVALID_SELECTION (I)", async () => {
    setupUnitTestEnv();
    const { handleCheckoutOperationSelection } = await import("./bot/checkout-attendance.flow");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    const twiml = await runWithBotRuntimeContext(simulationContext, async () =>
      runWithBotRuntimeSettings(runtimeSettings(), async () =>
        handleCheckoutOperationSelection({
          companyId,
          session: {
            id: "00000000-0000-4000-8000-000000000099",
            companyId,
            employeeId,
            operationId: null,
            employeeWorkdayId: null,
            attendanceRecordId: null,
            phoneNumber: "+5491111111111",
            state: "WAITING_CHECKOUT_OPERATION_SELECTION",
            contextJson: JSON.stringify({ workdayOptions: [] }),
            expiresAt: "2099-01-01T00:00:00.000Z",
            createdAt: "2026-07-05T15:00:00.000Z",
            updatedAt: "2026-07-05T15:00:00.000Z",
          },
          body: "9",
          employeeId,
          phoneFrom: "+5491111111111",
          phoneTo: "+5491000000000",
          messageSid: "SM-INVALID",
        }),
      ),
    );

    assert.match(twiml, new RegExp(INVALID_SELECTION_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("checkout respond sets observability resultCode after dry-run success (Q/observability)", async () => {
    setupUnitTestEnv();
    const { processCheckoutWithoutLocation } = await import("./bot/checkout-attendance.flow");
    const { employeeWorkdayAvailabilityService } = await import(
      "./employee-workday-availability.service"
    );
    const { botSessionService } = await import("./bot-session.service");
    const { runWithBotRuntimeContext, addVirtualCheckIn } = await import(
      "../utils/bot-runtime-context"
    );

    const employeeWorkdayId = "00000000-0000-4000-8000-000000000004";
    const attendanceRecordId = "00000000-0000-4000-8000-000000000005";
    const operationId = "00000000-0000-4000-8000-000000000003";

    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "eligible" as const,
      candidate: {
        employeeWorkdayId,
        operationWorkdayId: "00000000-0000-4000-8000-000000000006",
        operationId,
        serviceId: "00000000-0000-4000-8000-000000000007",
        serviceName: "Servicio",
        serviceAddress: "Addr",
        serviceLocality: "CABA",
        serviceLatitude: -34.6,
        serviceLongitude: -58.4,
        allowedRadiusMeters: 150,
        operationKind: "ONE_TIME" as const,
        workDate: "2026-07-05",
        expectedStartAt: "2026-07-05T15:00:00.000Z",
        expectedEndAt: "2026-07-05T21:00:00.000Z",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 30,
        scheduleTimezone: "America/Argentina/Buenos_Aires",
        attendanceRecordId,
        checkInAt: "2026-07-05T15:00:00.000Z",
      },
    }));
    mock.method(botSessionService, "completeSession", async () => undefined);

    const fakeTrace = {
      conversationId: null,
      correlationId: "corr-1",
      executionId: "exec-1",
      addStep: async () => undefined,
      complete: async () => undefined,
    };

    await runWithObservabilityTrace(fakeTrace as never, async () => {
      await runWithBotRuntimeContext(simulationContext, async () => {
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

        await runWithBotRuntimeSettings(
          { ...runtimeSettings(), requireCheckoutLocation: false },
          async () => {
            await processCheckoutWithoutLocation({
              companyId,
              employeeId,
              employeeWorkdayId,
              attendanceRecordId,
              operationId,
              phoneFrom: "+5491111111111",
              phoneTo: "+5491000000000",
              messageSid: "SM-OBS-1",
              sessionId: "session-1",
            });
          },
        );
      });

      const flowResult = getObservabilityFlowResult();
      assert.equal(flowResult?.resultCode, WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED);
      assert.equal(flowResult?.flowType, "CHECKOUT");
    });
  });

  it("does not revive deleted payroll success copy", () => {
    assert.doesNotMatch(GENERIC_ERROR_MESSAGE, /Listo, ya se enviaron tus recibos/);
  });
});
