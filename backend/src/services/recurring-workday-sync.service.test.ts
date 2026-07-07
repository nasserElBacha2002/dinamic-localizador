import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { recurringWorkdaySyncService } from "./recurring-workday-sync.service";

describe("recurringWorkdaySyncService", () => {
  it("throws RECURRING_WORKDAY_SYNC_FAILED when operation sync action fails", async () => {
    await assert.rejects(
      () =>
        recurringWorkdaySyncService.runOperationSync("company-1", "op-1", async () => {
          throw new Error("db timeout");
        }, "test"),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "RECURRING_WORKDAY_SYNC_FAILED" &&
        error.statusCode === 503,
    );
  });

  it("returns action result when sync succeeds", async () => {
    const result = await recurringWorkdaySyncService.runOperationSync(
      "company-1",
      "op-1",
      async () => ({ operationWorkdaysCreated: 2 }),
      "test",
    );
    assert.equal(result.operationWorkdaysCreated, 2);
  });

  it("throws when company reconciliation reports failures", () => {
    assert.throws(
      () =>
        recurringWorkdaySyncService.assertCompanySyncSucceeded({
          operationsProcessed: 2,
          operationsFailed: 1,
          results: [],
          failures: [{ operationId: "op-1", message: "fail" }],
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "RECURRING_WORKDAY_SYNC_FAILED",
    );
  });

  it("passes when company reconciliation has zero failures", () => {
    assert.doesNotThrow(() =>
      recurringWorkdaySyncService.assertCompanySyncSucceeded({
        operationsProcessed: 2,
        operationsFailed: 0,
        results: [],
        failures: [],
      }),
    );
  });
});
