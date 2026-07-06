import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyId = "00000000-0000-4000-8000-000000000001";
const operationId = "00000000-0000-4000-8000-000000000002";

describe("operationWorkDateService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns materialized work date without persisting", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { operationWorkDateService } = await import("./operation-work-date.service");

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      operationKind: "ONE_TIME",
      scheduledStart: "2026-07-10T23:30:00.000Z",
    }));
    mock.method(operationWorkdayRepository, "listByOperationId", async () => [
      { workDate: "2026-07-10" },
    ]);

    const workDate = await operationWorkDateService.resolveOperationWorkDate(companyId, operationId);
    assert.equal(workDate, "2026-07-10");
  });

  it("derives work date from schedule when not materialized", async () => {
    setupUnitTestEnv();
    const { operationRepository } = await import("../repositories/operation.repository");
    const { operationWorkdayRepository } = await import("../repositories/operation-workday.repository");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");
    const { operationWorkDateService } = await import("./operation-work-date.service");

    mock.method(operationRepository, "findById", async () => ({
      id: operationId,
      operationKind: "ONE_TIME",
      scheduledStart: "2026-07-10T23:30:00.000Z",
    }));
    mock.method(operationWorkdayRepository, "listByOperationId", async () => []);
    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));

    const workDate = await operationWorkDateService.resolveOperationWorkDate(companyId, operationId);
    assert.equal(workDate, "2026-07-10");
  });
});
