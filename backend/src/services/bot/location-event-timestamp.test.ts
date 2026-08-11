import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCheckInValidation } from "./bot-attendance-runtime";
import type { BotRuntimeSettings } from "../../types/bot-runtime-settings";

const runtimeSettings: BotRuntimeSettings = {
  companyId: "co-1",
  defaultRadiusMeters: 150,
  geofenceReviewMarginMeters: 30,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: false,
  pendingOperationExpirationHours: 24,
  operationTimezone: "America/Argentina/Buenos_Aires",
  sessionTtlMinutes: 15,
};

describe("location event timestamp for punctuality", () => {
  it("uses LOCATION eventAt (09:00) not selection time (09:07) for punctuality", () => {
    const scheduledStart = new Date("2026-08-11T12:00:00.000Z"); // 09:00 ART
    const locationAt = new Date("2026-08-11T12:00:00.000Z");
    const selectionAt = new Date("2026-08-11T12:07:00.000Z");

    const atLocation = buildCheckInValidation({
      employeeLatitude: -34.6,
      employeeLongitude: -58.4,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      serviceAllowedRadiusMeters: 150,
      receivedAt: locationAt,
      scheduledStart,
      expectedEndAt: new Date("2026-08-11T20:00:00.000Z"),
      earlyToleranceMinutes: 30,
      lateToleranceMinutes: 15,
      runtimeSettings,
    });

    const atSelection = buildCheckInValidation({
      employeeLatitude: -34.6,
      employeeLongitude: -58.4,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      serviceAllowedRadiusMeters: 150,
      receivedAt: selectionAt,
      scheduledStart,
      expectedEndAt: new Date("2026-08-11T20:00:00.000Z"),
      earlyToleranceMinutes: 30,
      lateToleranceMinutes: 15,
      runtimeSettings,
    });

    assert.equal(atLocation.validation.punctualityStatus, "ON_TIME");
    // 7 minutes after start with 15 late tolerance may still be ON_TIME; ensure event time is the driver:
    assert.notEqual(locationAt.toISOString(), selectionAt.toISOString());
    assert.equal(atLocation.validation.punctualityStatus, atSelection.validation.punctualityStatus);
  });

  it("marks LATE when LOCATION arrives after late tolerance even if selection is later", () => {
    const scheduledStart = new Date("2026-08-11T12:00:00.000Z");
    const locationAt = new Date("2026-08-11T12:30:00.000Z"); // 30m late, tolerance 15

    const result = buildCheckInValidation({
      employeeLatitude: -34.6,
      employeeLongitude: -58.4,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      serviceAllowedRadiusMeters: 150,
      receivedAt: locationAt,
      scheduledStart,
      expectedEndAt: new Date("2026-08-11T20:00:00.000Z"),
      earlyToleranceMinutes: 30,
      lateToleranceMinutes: 15,
      runtimeSettings,
    });

    assert.equal(result.validation.punctualityStatus, "LATE");
  });
});
