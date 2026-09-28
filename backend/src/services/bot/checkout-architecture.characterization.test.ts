import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import {
  resolveCheckoutWhatsAppResultCode,
  roundCheckoutDistanceMeters,
} from "./checkout-result-code";
import { attendanceRecordFromVirtualCheckIn } from "./checkout-simulation-attendance";
import type { VirtualAttendanceRecord } from "../../utils/bot-runtime-context";
import {
  classifyReminderSendOutcome,
  emptyReminderKindCounts,
  mergeReminderKindCounts,
} from "../attendance-reminder-outcomes";

describe("resolveCheckoutWhatsAppResultCode", () => {
  it("maps CHECKOUT_REJECTED to outside-radius observability code", () => {
    assert.equal(
      resolveCheckoutWhatsAppResultCode({
        checkoutStatus: "CHECKOUT_REJECTED",
        checkoutWithoutArrival: false,
      }),
      WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS,
    );
    assert.equal(
      resolveCheckoutWhatsAppResultCode({
        checkoutStatus: "CHECKOUT_REJECTED",
        checkoutWithoutArrival: true,
      }),
      WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS,
    );
  });

  it("maps accepted checkout with arrival to CHECKOUT_COMPLETED", () => {
    assert.equal(
      resolveCheckoutWhatsAppResultCode({
        checkoutStatus: "CHECKOUT_VALID",
        checkoutWithoutArrival: false,
      }),
      WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED,
    );
  });

  it("maps accepted exit-without-arrival to CHECKOUT_WITHOUT_ARRIVAL", () => {
    assert.equal(
      resolveCheckoutWhatsAppResultCode({
        checkoutStatus: "CHECKOUT_EARLY_WITHIN_TOLERANCE",
        checkoutWithoutArrival: true,
      }),
      WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL,
    );
  });
});

describe("roundCheckoutDistanceMeters", () => {
  it("rounds to two decimal places", () => {
    assert.equal(roundCheckoutDistanceMeters(12.3456), 12.35);
    assert.equal(roundCheckoutDistanceMeters(12.344), 12.34);
  });
});

describe("attendanceRecordFromVirtualCheckIn", () => {
  const virtual: VirtualAttendanceRecord = {
    id: "att-sim-1",
    operationId: "op-1",
    employeeId: "emp-1",
    employeeWorkdayId: "ew-1",
    receivedAt: "2026-03-20T12:00:00.000Z",
    validationStatus: "VALID",
    locationStatus: "INSIDE_GEOFENCE",
    punctualityStatus: "ON_TIME",
    distanceMeters: 42,
    checkoutAt: null,
    checkoutStatus: null,
  };

  it("hydrates durable-shaped attendance for dry-run simulation", () => {
    const record = attendanceRecordFromVirtualCheckIn(virtual, {
      simulationSessionId: "sim-session",
      receivedLatitude: -34.6,
      receivedLongitude: -58.4,
    });

    assert.equal(record.id, "att-sim-1");
    assert.equal(record.isSimulation, true);
    assert.equal(record.simulationSessionId, "sim-session");
    assert.equal(record.receivedLatitude, -34.6);
    assert.equal(record.receivedLongitude, -58.4);
    assert.equal(record.distanceMeters, 42);
    assert.equal(record.checkoutAt, null);
    assert.equal(record.sourceMessageSid, null);
  });

  it("defaults coordinates to 0 when omitted (without-location path)", () => {
    const record = attendanceRecordFromVirtualCheckIn(virtual, {
      simulationSessionId: null,
    });
    assert.equal(record.receivedLatitude, 0);
    assert.equal(record.receivedLongitude, 0);
    assert.equal(record.simulationSessionId, null);
  });
});

describe("attendance-reminder-outcomes", () => {
  it("classifies Twilio-accepted partial failures as sent", () => {
    assert.equal(classifyReminderSendOutcome("sent"), "sent");
    assert.equal(classifyReminderSendOutcome("sent_context_failed"), "sent");
    assert.equal(classifyReminderSendOutcome("sent_persistence_unknown"), "sent");
    assert.equal(classifyReminderSendOutcome("failed"), "failed");
    assert.equal(classifyReminderSendOutcome("skipped"), "skipped");
  });

  it("merges kind counts without mutating inputs", () => {
    const left = emptyReminderKindCounts();
    left.ONE_TIME = 2;
    const right = emptyReminderKindCounts();
    right.RECURRING = 3;
    const merged = mergeReminderKindCounts(left, right);
    assert.deepEqual(merged, { ONE_TIME: 2, RECURRING: 3, OTHER: 0 });
    assert.equal(left.RECURRING, 0);
  });
});
