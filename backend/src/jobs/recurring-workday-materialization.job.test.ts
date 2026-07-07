import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
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

    const { runRecurringWorkdayMaterializationJobHandler } = await import(
      "../jobs/recurring-workday-materialization.job"
    );

    await runRecurringWorkdayMaterializationJobHandler();

    assert.equal(materializeCalls, 2);
  });
});
