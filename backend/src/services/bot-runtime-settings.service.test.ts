import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const existingSettings = {
  id: "settings-1",
  companyId: "company-1",
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 175,
  lateGraceMinutes: 20,
  earlyLeaveToleranceMinutes: 10,
  requireCheckoutLocation: false,
  allowManualAttendanceCorrections: true,
  pendingOperationExpirationHours: 12,
  geofenceReviewMarginMeters: 45,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("botRuntimeSettingsService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns persisted company settings including company geofence review margin", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => existingSettings);

    const settings = await botRuntimeSettingsService.getBotRuntimeSettings("company-1");

    assert.equal(settings.companyId, "company-1");
    assert.equal(settings.defaultRadiusMeters, 175);
    assert.equal("lateGraceMinutes" in settings, false);
    assert.equal(settings.requireCheckoutLocation, false);
    assert.equal(settings.geofenceReviewMarginMeters, 45);
    assert.equal(settings.sessionTtlMinutes, 15);
  });

  it("uses env geofence margin when company has no custom margin", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      ...existingSettings,
      geofenceReviewMarginMeters: null,
    }));

    const settings = await botRuntimeSettingsService.getBotRuntimeSettings("company-1");
    assert.equal(settings.geofenceReviewMarginMeters, 30);
  });

  it("falls back to application defaults when settings row is missing", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => null);

    const settings = await botRuntimeSettingsService.getBotRuntimeSettings("company-1");

    assert.equal(settings.defaultRadiusMeters, DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultRadiusMeters);
    assert.equal(settings.requireCheckoutLocation, true);
    assert.equal(settings.geofenceReviewMarginMeters, 30);
  });

  it("fails closed when repository read fails with transient error", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      throw new Error("DB_UNAVAILABLE");
    });

    await assert.rejects(
      () => botRuntimeSettingsService.getBotRuntimeSettings("company-1"),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "GEOFENCE_POLICY_UNAVAILABLE" ||
          error.code === "BOT_RUNTIME_SETTINGS_UNAVAILABLE"),
    );
  });

  it("rethrows business errors for invalid company access", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    });

    await assert.rejects(
      () => botRuntimeSettingsService.getBotRuntimeSettings("missing-company"),
      (error: unknown) => error instanceof AppError && error.code === "COMPANY_NOT_FOUND",
    );
  });
});
