import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const sampleSettings = {
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const defaults = {
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
};

describe("companySettingsRepository.findOrCreateByCompanyId", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns existing settings without inserting", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("./company-settings.repository");

    let createCalls = 0;
    mock.method(companySettingsRepository, "findByCompanyId", async () => sampleSettings);
    mock.method(companySettingsRepository, "create", async () => {
      createCalls += 1;
      return sampleSettings;
    });

    const result = await companySettingsRepository.findOrCreateByCompanyId("company-1", defaults);
    assert.equal(result.companyId, "company-1");
    assert.equal(createCalls, 0);
  });

  it("creates defaults when settings row is missing", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("./company-settings.repository");

    let findCalls = 0;
    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      findCalls += 1;
      return findCalls === 1 ? null : sampleSettings;
    });
    mock.method(companySettingsRepository, "create", async () => sampleSettings);

    const result = await companySettingsRepository.findOrCreateByCompanyId("company-1", defaults);
    assert.equal(result.defaultRadiusMeters, 150);
  });

  it("retries read after duplicate-key race on insert", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("./company-settings.repository");

    let findCalls = 0;
    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      findCalls += 1;
      return findCalls === 1 ? null : sampleSettings;
    });
    mock.method(companySettingsRepository, "create", async () => {
      const error = new Error("duplicate") as Error & { number: number };
      error.number = 2627;
      throw error;
    });

    const result = await companySettingsRepository.findOrCreateByCompanyId("company-1", defaults);
    assert.equal(result.companyId, "company-1");
    assert.equal(findCalls, 2);
  });
});
