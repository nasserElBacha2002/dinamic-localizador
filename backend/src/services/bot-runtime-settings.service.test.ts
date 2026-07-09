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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("botRuntimeSettingsService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns persisted company settings with env fallbacks for session and review margin", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    let readCount = 0;
    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      readCount += 1;
      return existingSettings;
    });

    const settings = await botRuntimeSettingsService.getBotRuntimeSettings("company-1");

    assert.equal(readCount, 1);
    assert.equal(settings.companyId, "company-1");
    assert.equal(settings.defaultRadiusMeters, 175);
    assert.equal(settings.lateGraceMinutes, 20);
    assert.equal(settings.requireCheckoutLocation, false);
    assert.equal(settings.geofenceReviewMarginMeters, 30);
    assert.equal(settings.sessionTtlMinutes, 15);
  });

  it("falls back to application defaults when settings row is missing", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => null);

    const settings = await botRuntimeSettingsService.getBotRuntimeSettings("company-1");

    assert.equal(settings.defaultRadiusMeters, DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultRadiusMeters);
    assert.equal(settings.requireCheckoutLocation, true);
  });

  it("falls back safely when repository read fails with transient error", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { botRuntimeSettingsService } = await import("./bot-runtime-settings.service");

    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      throw new Error("DB_UNAVAILABLE");
    });

    const settings = await botRuntimeSettingsService.getBotRuntimeSettings("company-1");

    assert.equal(settings.defaultRadiusMeters, DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultRadiusMeters);
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
