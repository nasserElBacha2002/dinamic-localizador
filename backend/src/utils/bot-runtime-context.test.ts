import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addVirtualCheckIn,
  completeVirtualCheckOut,
  findVirtualCheckInForCheckout,
  hasVirtualActiveRecord,
  runWithBotRuntimeContext,
  type BotRuntimeContext,
} from "./bot-runtime-context";

const baseContext = (): BotRuntimeContext => ({
  simulationSessionId: "00000000-0000-4000-8000-000000000001",
  employeeIdOverride: "00000000-0000-4000-8000-000000000002",
  phoneNumber: "+5491111111111",
  simulatedNow: new Date("2026-06-30T12:00:00.000Z"),
  mode: "dry-run",
  skipWhatsAppPersistence: true,
  messages: [],
  technicalDetails: {},
  simulationArtifacts: [],
  virtualAttendanceRecords: [],
  lastBotResponse: null,
  lastDetectedIntent: null,
  lastTwilioPayload: null,
});

describe("virtual attendance in simulation context", () => {
  it("supports dry-run check-in and checkout lookup", async () => {
    await runWithBotRuntimeContext(baseContext(), async () => {
      addVirtualCheckIn({
        operationId: "inv-1",
        employeeId: "emp-1",
        receivedAt: "2026-06-30T12:00:00.000Z",
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        distanceMeters: 12,
      });

      assert.equal(hasVirtualActiveRecord("inv-1", "emp-1"), true);

      const checkIn = findVirtualCheckInForCheckout("inv-1", "emp-1");
      assert.ok(checkIn);
      completeVirtualCheckOut(checkIn!.id, {
        checkoutAt: "2026-06-30T21:00:00.000Z",
        checkoutStatus: "CHECKOUT_VALID",
      });

      assert.equal(findVirtualCheckInForCheckout("inv-1", "emp-1"), null);
    });
  });
});
