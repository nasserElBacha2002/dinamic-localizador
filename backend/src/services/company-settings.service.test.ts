import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const activeCompany = {
  id: "company-1",
  name: "Co",
  legalName: null,
  taxId: null,
  country: null,
  defaultTimezone: "America/Argentina/Buenos_Aires",
  status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const existingSettings = {
  id: "settings-1",
  companyId: "company-1",
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  defaultEarlyArrivalToleranceMinutes: 60,
  defaultLateArrivalToleranceMinutes: 90,
  defaultOperationStartTime: "20:30",
  defaultOperationEndTime: "03:00",
  geofenceReviewMarginMeters: null,
  confirmationReminderEnabled: true,
  confirmationReminderHoursBefore: 24,
  pendingOperationExpirationHours: 12,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("companyService settings", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("OWNER can read settings and receives DTO without id", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyService } = await import("./company.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companySettingsRepository, "findOrCreateByCompanyId", async () => existingSettings);

    const settings = await companyService.getSettings("company-1");
    assert.equal(settings.companyId, "company-1");
    assert.equal("id" in settings, false);
  });

  it("uses findOrCreateByCompanyId when settings row is missing", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyService } = await import("./company.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companySettingsRepository, "findOrCreateByCompanyId", async () => existingSettings);

    const settings = await companyService.getSettings("company-1");
    assert.equal(settings.defaultRadiusMeters, 150);
  });

  it("OWNER can update existing settings", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyService } = await import("./company.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companySettingsRepository, "findByCompanyId", async () => existingSettings);
    mock.method(companySettingsRepository, "update", async () => ({
      ...existingSettings,
      defaultRadiusMeters: 200,
    }));

    const settings = await companyService.updateSettings("company-1", "OWNER", {
      defaultRadiusMeters: 200,
    });
    assert.equal(settings.defaultRadiusMeters, 200);
  });

  it("creates defaults plus patch input in one write when row is missing", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyService } = await import("./company.service");

    let updateCalls = 0;
    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);
    mock.method(companySettingsRepository, "create", async (_companyId, input) => ({
      ...existingSettings,
      defaultRadiusMeters: input.defaultRadiusMeters,
      lateGraceMinutes: input.lateGraceMinutes,
    }));
    mock.method(companySettingsRepository, "update", async () => {
      updateCalls += 1;
      return existingSettings;
    });

    const settings = await companyService.updateSettings("company-1", "OWNER", {
      defaultRadiusMeters: 220,
      lateGraceMinutes: 20,
    });

    assert.equal(updateCalls, 0);
    assert.equal(settings.defaultRadiusMeters, 220);
    assert.equal(settings.lateGraceMinutes, 20);
  });

  it("READ_ONLY cannot update settings", async () => {
    setupUnitTestEnv();
    const { companyService } = await import("./company.service");

    await assert.rejects(
      () =>
        companyService.updateSettings("company-1", "READ_ONLY", {
          defaultRadiusMeters: 200,
        }),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("fails update for invalid company", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyService } = await import("./company.service");

    mock.method(companyRepository, "findById", async () => null);

    await assert.rejects(
      () =>
        companyService.updateSettings("company-1", "OWNER", {
          defaultRadiusMeters: 200,
        }),
      (error: unknown) => error instanceof AppError && error.code === "COMPANY_NOT_FOUND",
    );
  });
});

describe("companyOperationalSettingsService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns persisted settings when available", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyOperationalSettingsService } = await import(
      "./company-operational-settings.service"
    );

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      ...existingSettings,
      defaultRadiusMeters: 175,
    }));

    const settings = await companyOperationalSettingsService.getCompanyOperationalSettings(
      "company-1",
    );
    assert.equal(settings.defaultRadiusMeters, 175);
    assert.equal("createdAt" in settings, false);
  });

  it("uses application defaults when settings row is missing", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyOperationalSettingsService } = await import(
      "./company-operational-settings.service"
    );

    mock.method(companySettingsRepository, "findByCompanyId", async () => null);

    const settings = await companyOperationalSettingsService.getCompanyOperationalSettings(
      "company-1",
    );
    assert.equal(settings.companyId, "company-1");
    assert.equal(settings.defaultRadiusMeters, 150);
  });
});
