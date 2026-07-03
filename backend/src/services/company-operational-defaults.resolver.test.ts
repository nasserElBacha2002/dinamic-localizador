import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "company-1";

const fullSettings = {
  id: "settings-1",
  companyId,
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 150,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  defaultEarlyArrivalToleranceMinutes: 45,
  defaultLateArrivalToleranceMinutes: 75,
  defaultOperationStartTime: "21:00",
  defaultOperationEndTime: "04:00",
  geofenceReviewMarginMeters: 25,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("companyOperationalDefaultsResolver", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("getInventoryDefaults returns persisted company tolerances", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    mock.method(companySettingsRepository, "findByCompanyId", async () => fullSettings);

    const defaults = await companyOperationalDefaultsResolver.getInventoryDefaults(companyId);
    assert.equal(defaults.earlyToleranceMinutes, 45);
    assert.equal(defaults.lateToleranceMinutes, 75);
    assert.equal(defaults.source, "company_settings");
  });

  it("getInventoryDefaults falls back to application defaults when row is missing", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    mock.method(companySettingsRepository, "findByCompanyId", async () => null);

    const defaults = await companyOperationalDefaultsResolver.getInventoryDefaults(companyId);
    assert.equal(
      defaults.earlyToleranceMinutes,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
    );
    assert.equal(
      defaults.lateToleranceMinutes,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
    );
    assert.equal(defaults.source, "operational_defaults");
  });

  it("getImportDefaults resolves timezone, schedule, and geofence review margin", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    let findCalls = 0;
    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      findCalls += 1;
      return fullSettings;
    });

    const defaults = await companyOperationalDefaultsResolver.getImportDefaults(companyId);
    assert.equal(findCalls, 1);
    assert.equal(defaults.earlyToleranceMinutes, 45);
    assert.equal(defaults.lateToleranceMinutes, 75);
    assert.equal(defaults.operationTimezone, "America/Argentina/Buenos_Aires");
    assert.equal(defaults.timezoneSource, "company_settings");
    assert.equal(defaults.defaultOperationStartTime, "21:00");
    assert.equal(defaults.defaultOperationEndTime, "04:00");
    assert.equal(defaults.geofenceReviewMarginMeters, 25);
    assert.equal(defaults.geofenceReviewMarginSource, "company_settings");
  });

  it("getImportDefaults uses env for geofence review margin when company value is null", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      ...fullSettings,
      geofenceReviewMarginMeters: null,
      defaultOperationStartTime: null,
      defaultOperationEndTime: null,
    }));

    const defaults = await companyOperationalDefaultsResolver.getImportDefaults(companyId);
    assert.equal(defaults.geofenceReviewMarginSource, "environment");
    assert.equal(defaults.geofenceReviewMarginMeters, 30);
    assert.equal(defaults.defaultOperationStartTime, "20:30");
    assert.equal(defaults.defaultOperationEndTime, "03:00");
  });

  it("getStoreDefaults uses operational settings service fallback chain", async () => {
    setupUnitTestEnv();
    const { companyOperationalSettingsService } = await import(
      "./company-operational-settings.service"
    );
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    mock.method(
      companyOperationalSettingsService,
      "getCompanyOperationalSettingsWithSource",
      async () => ({
        settings: {
          companyId,
          defaultRadiusMeters: 180,
          operationTimezone: "America/Argentina/Buenos_Aires",
          lateGraceMinutes: 15,
          earlyLeaveToleranceMinutes: 15,
          requireCheckoutLocation: true,
          allowManualAttendanceCorrections: true,
        },
        source: "company_settings" as const,
      }),
    );

    const defaults = await companyOperationalDefaultsResolver.getStoreDefaults(companyId);
    assert.equal(defaults.defaultRadiusMeters, 180);
    assert.equal(defaults.source, "company_settings");
  });

  it("getAbsenceDefaults maps repository rows", async () => {
    setupUnitTestEnv();
    const { companyAbsenceSettingsRepository } = await import(
      "../repositories/company-absence-settings.repository"
    );
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    mock.method(companyAbsenceSettingsRepository, "listByCompanyId", async () => [
      {
        id: "abs-1",
        companyId,
        absenceTypeCode: "VACATION",
        defaultAnnualDays: 14,
        autoAssignOnEmployeeCreate: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const defaults = await companyOperationalDefaultsResolver.getAbsenceDefaults(companyId);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0]?.absenceTypeCode, "VACATION");
    assert.equal(defaults[0]?.defaultAnnualDays, 14);
    assert.equal(defaults[0]?.autoAssignOnEmployeeCreate, true);
  });

  it("getLocationTypes returns active location types", async () => {
    setupUnitTestEnv();
    const { companyLocationTypesRepository } = await import(
      "../repositories/company-location-types.repository"
    );
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    mock.method(companyLocationTypesRepository, "listByCompanyId", async () => [
      {
        id: "lt-1",
        companyId,
        code: "Express",
        name: "Express",
        isActive: true,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const types = await companyOperationalDefaultsResolver.getLocationTypes(companyId);
    assert.equal(types.length, 1);
    assert.equal(types[0]?.code, "Express");
  });

  it("buildDefaultSettingsInput matches unified constants", async () => {
    setupUnitTestEnv();
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );

    const input = companyOperationalDefaultsResolver.buildDefaultSettingsInput();
    assert.equal(
      input.defaultEarlyArrivalToleranceMinutes,
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
    );
    assert.equal(input.defaultOperationStartTime, "20:30");
    assert.equal(input.geofenceReviewMarginMeters, null);
  });
});
