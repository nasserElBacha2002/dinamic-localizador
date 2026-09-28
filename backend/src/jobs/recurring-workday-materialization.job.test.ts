import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("recurring workday materialization job handler", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("processes eligible recurring operations and skips failures for others", async () => {
    setupUnitTestEnv();

    mock.method(companyRepository, "listActive", async () => [{ id: "company-1" }]);
    mock.method(operationScheduleRepository, "listMaterializableRecurringOperationIds", async () => [
      "op-ok",
      "op-fail",
    ]);

    const { recurringWorkdayMaterializationService } = await import(
      "../services/recurring-workday-materialization.service"
    );

    let materializeCalls = 0;
    mock.method(recurringWorkdayMaterializationService, "materializeOperationHorizon", async (_companyId, operationId) => {
      materializeCalls += 1;
      if (operationId === "op-fail") {
        throw new Error("sync failed");
      }
      return {
        operationId,
        rangeStart: "2026-08-10",
        rangeEnd: "2026-08-10",
        operationWorkdaysCreated: 1,
        operationWorkdaysUpdated: 0,
        operationWorkdaysCancelled: 0,
        employeeWorkdaysCreated: 0,
        employeeWorkdaysReactivated: 0,
        employeeWorkdaysCancelled: 0,
        unchanged: 0,
      };
    });
    mock.method(recurringWorkdayMaterializationService, "runScheduledTick", async () => {
      const summary = await recurringWorkdayMaterializationService.materializeAllCompaniesHorizon();
      return { lockSkipped: false as const, summary };
    });

    const { runRecurringWorkdayMaterializationJobHandler } = await import(
      "../jobs/recurring-workday-materialization.job"
    );

    await runRecurringWorkdayMaterializationJobHandler();

    assert.equal(materializeCalls, 2);
  });

  it("skips tick when distributed lease is held", async () => {
    setupUnitTestEnv();

    const { recurringWorkdayMaterializationService } = await import(
      "../services/recurring-workday-materialization.service"
    );
    let called = 0;
    mock.method(recurringWorkdayMaterializationService, "runScheduledTick", async () => {
      return { lockSkipped: true as const };
    });
    mock.method(recurringWorkdayMaterializationService, "materializeAllCompaniesHorizon", async () => {
      called += 1;
      return { operationsProcessed: 0, operationsFailed: 0, results: [], failures: [] };
    });

    const { runRecurringWorkdayMaterializationJobHandler } = await import(
      "../jobs/recurring-workday-materialization.job"
    );

    await runRecurringWorkdayMaterializationJobHandler();
    assert.equal(called, 0);
  });
});

describe("whatsapp quota policy load semantics (4B.2)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("configured settings → company policy", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
      whatsappQuotaMode: "ENFORCE",
      whatsappQuotaDailyTurns: 10,
    }));

    const { whatsappUsageQuotaService } = await import("../services/whatsapp-usage-quota.service");
    const resolved = await whatsappUsageQuotaService.resolvePolicy("company-1");
    assert.equal(resolved.kind, "configured");
    if (resolved.kind === "configured") {
      assert.equal(resolved.value.mode, "ENFORCE");
      assert.equal(resolved.value.dailyTurns, 10);
      assert.equal(resolved.settingsSource, "company");
    }
  });

  it("missing settings row → documented default (not error)", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    mock.method(companySettingsRepository, "findByCompanyId", async () => null);

    const { whatsappUsageQuotaService } = await import("../services/whatsapp-usage-quota.service");
    const resolved = await whatsappUsageQuotaService.resolvePolicy("company-1");
    assert.equal(resolved.kind, "defaulted");
    if (resolved.kind === "defaulted") {
      assert.equal(resolved.value.mode, "OFF");
      assert.equal(resolved.reason, "not_configured");
    }
  });

  it("repository failure → explicit error (no silent default)", async () => {
    setupUnitTestEnv();
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    mock.method(companySettingsRepository, "findByCompanyId", async () => {
      throw new Error("DB timeout");
    });

    const { whatsappUsageQuotaService } = await import("../services/whatsapp-usage-quota.service");
    const resolved = await whatsappUsageQuotaService.resolvePolicy("company-1");
    assert.equal(resolved.kind, "error");

    await assert.rejects(
      () => whatsappUsageQuotaService.loadPolicy("company-1"),
      (error: unknown) =>
        error instanceof AppError && error.code === "WHATSAPP_QUOTA_POLICY_UNAVAILABLE",
    );
  });
});
