import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotRuntimeSettings } from "../../types/bot-runtime-settings";
import { evaluatePunctuality } from "../../utils/attendance-validation";
import {
  buildCheckInValidation,
  buildCheckoutValidation,
  buildCheckoutValidationWithoutLocation,
} from "./bot-attendance-runtime";

const baseRuntimeSettings = (): BotRuntimeSettings => ({
  companyId: "company-1",
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  geofenceReviewMarginMeters: 30,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  pendingOperationExpirationHours: 12,
  sessionTtlMinutes: 15,
});

const serviceCoords = {
  latitude: -34.6,
  longitude: -58.4,
};

describe("bot attendance runtime", () => {
  it("accepts check-in inside company default radius", () => {
    const result = buildCheckInValidation({
      employeeLatitude: serviceCoords.latitude,
      employeeLongitude: serviceCoords.longitude,
      serviceLatitude: serviceCoords.latitude,
      serviceLongitude: serviceCoords.longitude,
      serviceAllowedRadiusMeters: 0,
      receivedAt: new Date("2026-07-05T15:05:00.000Z"),
      scheduledStart: new Date("2026-07-05T15:00:00.000Z"),
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      runtimeSettings: baseRuntimeSettings(),
    });

    assert.equal(result.effectiveRadiusMeters, 150);
    assert.equal(result.validation.validationStatus, "VALID");
    assert.equal(result.validation.punctualityStatus, "LATE");
  });

  it("rejects check-in outside tighter company radius", () => {
    const runtimeSettings = { ...baseRuntimeSettings(), defaultRadiusMeters: 50 };
    const result = buildCheckInValidation({
      employeeLatitude: -34.605,
      employeeLongitude: -58.405,
      serviceLatitude: serviceCoords.latitude,
      serviceLongitude: serviceCoords.longitude,
      serviceAllowedRadiusMeters: 0,
      receivedAt: new Date("2026-07-05T15:05:00.000Z"),
      scheduledStart: new Date("2026-07-05T15:00:00.000Z"),
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      runtimeSettings,
    });

    assert.equal(result.effectiveRadiusMeters, 50);
    assert.equal(result.validation.validationStatus, "REJECTED");
  });

  it("rejects check-in after the operation late tolerance", () => {
    const runtimeSettings = baseRuntimeSettings();
    const result = buildCheckInValidation({
      employeeLatitude: serviceCoords.latitude,
      employeeLongitude: serviceCoords.longitude,
      serviceLatitude: serviceCoords.latitude,
      serviceLongitude: serviceCoords.longitude,
      serviceAllowedRadiusMeters: 150,
      receivedAt: new Date("2026-07-05T15:31:00.000Z"),
      scheduledStart: new Date("2026-07-05T15:00:00.000Z"),
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      runtimeSettings,
    });

    assert.equal(result.validation.punctualityStatus, "OUTSIDE_TIME_WINDOW");
    assert.equal(result.validation.validationStatus, "REJECTED");
  });

  it("matches the channel-neutral policy for the same operation and timestamp", () => {
    const receivedAt = new Date("2026-07-05T15:30:00.000Z");
    const scheduledStart = new Date("2026-07-05T15:00:00.000Z");
    const internal = evaluatePunctuality(receivedAt, scheduledStart, 15, 30);
    const viaWhatsApp = buildCheckInValidation({
      employeeLatitude: serviceCoords.latitude,
      employeeLongitude: serviceCoords.longitude,
      serviceLatitude: serviceCoords.latitude,
      serviceLongitude: serviceCoords.longitude,
      serviceAllowedRadiusMeters: 150,
      receivedAt,
      scheduledStart,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      runtimeSettings: baseRuntimeSettings(),
    });

    assert.equal(viaWhatsApp.validation.punctualityStatus, internal.punctualityStatus);
    assert.equal(viaWhatsApp.validation.validationStatus, internal.timeValidationStatus);
  });

  it("uses early leave tolerance for checkout classification", () => {
    const runtimeSettings = { ...baseRuntimeSettings(), earlyLeaveToleranceMinutes: 5 };
    const result = buildCheckoutValidation({
      employeeLatitude: serviceCoords.latitude,
      employeeLongitude: serviceCoords.longitude,
      serviceLatitude: serviceCoords.latitude,
      serviceLongitude: serviceCoords.longitude,
      serviceAllowedRadiusMeters: 150,
      checkoutAt: new Date("2026-07-05T20:58:00.000Z"),
      scheduledEnd: new Date("2026-07-05T21:00:00.000Z"),
      runtimeSettings,
    });

    assert.equal(result.validation.checkoutStatus, "CHECKOUT_EARLY_WITHIN_TOLERANCE");
  });

  it("supports checkout without location using time-only validation", () => {
    const validation = buildCheckoutValidationWithoutLocation({
      checkoutAt: new Date("2026-07-05T21:10:00.000Z"),
      scheduledEnd: new Date("2026-07-05T21:00:00.000Z"),
      runtimeSettings: baseRuntimeSettings(),
    });

    assert.equal(validation.checkoutStatus, "CHECKOUT_LATE_EXTRA_TIME");
    assert.equal(validation.extraWorkedMinutes, 10);
  });
});
