import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotRuntimeSettings } from "../../types/bot-runtime-settings";
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
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
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
    assert.equal(result.validation.punctualityStatus, "ON_TIME");
  });

  it("rejects check-in outside tighter company radius", () => {
    const runtimeSettings = { ...baseRuntimeSettings(), defaultRadiusMeters: 50 };
    const result = buildCheckInValidation({
      employeeLatitude: -34.6005,
      employeeLongitude: -58.4005,
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

  it("marks late immediately when lateGraceMinutes is zero", () => {
    const runtimeSettings = { ...baseRuntimeSettings(), lateGraceMinutes: 0 };
    const result = buildCheckInValidation({
      employeeLatitude: serviceCoords.latitude,
      employeeLongitude: serviceCoords.longitude,
      serviceLatitude: serviceCoords.latitude,
      serviceLongitude: serviceCoords.longitude,
      serviceAllowedRadiusMeters: 150,
      receivedAt: new Date("2026-07-05T15:01:00.000Z"),
      scheduledStart: new Date("2026-07-05T15:00:00.000Z"),
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
      runtimeSettings,
    });

    assert.equal(result.validation.punctualityStatus, "LATE");
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
