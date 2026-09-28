import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { evaluateAttendanceCheckIn } from "../utils/evaluate-attendance-check-in";
import { evaluateGeofence } from "../utils/attendance-validation";
import { calculateDistanceMeters } from "../utils/haversine";

setupUnitTestEnv();

/**
 * Observable policy equivalence across REST / Bot / Simulator consumers.
 * Same company + service + coordinates → same distance decision and margin/radius.
 */
describe("geofence policy cross-flow regression", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const companyId = "company-geo-1";
  const serviceLat = -34.6037;
  const serviceLon = -58.3816;
  const employeeLat = serviceLat + 0.001; // ~111m
  const employeeLon = serviceLon;

  it("company margin + service radius yield identical outcomes for REST and bot primitive", async () => {
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");
    const { geolocationService } = await import("./geolocation.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      id: "s1",
      companyId,
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: 200,
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 10,
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: false,
      pendingOperationExpirationHours: 24,
      geofenceReviewMarginMeters: 40,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const serviceRadius = 120;
    const restPolicy = await geofencePolicyResolver.resolveForService(companyId, serviceRadius);
    const runtime = await botRuntimeSettingsService.getBotRuntimeSettings(companyId);
    const restEval = await geolocationService.evaluateDistance(
      companyId,
      employeeLat,
      employeeLon,
      serviceLat,
      serviceLon,
      serviceRadius,
    );

    const botEval = evaluateAttendanceCheckIn({
      coordinates: { latitude: employeeLat, longitude: employeeLon },
      serviceCoordinates: { latitude: serviceLat, longitude: serviceLon },
      geofencePolicy: {
        radiusMeters: serviceRadius > 0 ? serviceRadius : runtime.defaultRadiusMeters,
        marginMeters: runtime.geofenceReviewMarginMeters,
      },
      authoritativeAt: new Date("2026-09-21T12:00:00.000Z"),
      scheduledStart: new Date("2026-09-21T12:00:00.000Z"),
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
    });

    // Simulator path uses the same runtime margin + service radius
    const simDistance = calculateDistanceMeters(employeeLat, employeeLon, serviceLat, serviceLon);
    const simGeo = evaluateGeofence(simDistance, serviceRadius, runtime.geofenceReviewMarginMeters);

    assert.equal(restPolicy.radiusMeters, 120);
    assert.equal(restPolicy.marginMeters, 40);
    assert.equal(runtime.geofenceReviewMarginMeters, 40);
    assert.equal(restEval.policy.radiusMeters, botEval.effectiveRadiusMeters);
    assert.equal(restEval.policy.marginMeters, runtime.geofenceReviewMarginMeters);
    assert.equal(restEval.locationStatus, botEval.validation.locationStatus);
    assert.equal(restEval.geoValidationStatus, simGeo.geoValidationStatus);
    assert.equal(simGeo.locationStatus, restEval.locationStatus);
    assert.ok(Math.abs(restEval.distanceMeters - botEval.distanceMeters) < 0.01);
  });

  it("missing custom settings falls back to env margin consistently", async () => {
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => null);

    const policy = await geofencePolicyResolver.resolveForService(companyId, 0);
    const runtime = await botRuntimeSettingsService.getBotRuntimeSettings(companyId);

    assert.equal(policy.marginMeters, 30);
    assert.equal(runtime.geofenceReviewMarginMeters, 30);
    assert.equal(policy.marginSource, "environment");
  });

  it("settings repository error fails closed for REST and bot", async () => {
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      throw new Error("SETTINGS_DB_DOWN");
    });

    await assert.rejects(
      () => geofencePolicyResolver.resolveForService(companyId, 100),
      (error: unknown) =>
        error instanceof AppError && error.code === "GEOFENCE_POLICY_UNAVAILABLE",
    );

    await assert.rejects(
      () => botRuntimeSettingsService.getBotRuntimeSettings(companyId),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "BOT_RUNTIME_SETTINGS_UNAVAILABLE" ||
          error.code === "GEOFENCE_POLICY_UNAVAILABLE"),
    );
  });

  it("resolveFromSettings uses a single snapshot without a second repository read", async () => {
    const { geofencePolicyResolver } = await import("./geofence-policy.resolver");
    const snapshot = {
      defaultRadiusMeters: 175,
      geofenceReviewMarginMeters: 55,
    };

    const policy = geofencePolicyResolver.resolveFromSettings(companyId, snapshot, 90);
    assert.equal(policy.radiusMeters, 90);
    assert.equal(policy.radiusSource, "service");
    assert.equal(policy.marginMeters, 55);
    assert.equal(policy.marginSource, "company_settings");
  });
});
