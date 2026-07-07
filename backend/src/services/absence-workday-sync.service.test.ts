import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("absenceWorkdaySyncService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns workdayReconciliation when reconciliation succeeds", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");

    const result = await absenceWorkdaySyncService.runAfterAbsenceMutation(
      "company-1",
      "absence-1",
      async () => ({ id: "absence-1", status: "APPROVED" }),
      async () => ({
        justified: 2,
        restored: 0,
        relinked: 0,
        unchanged: 0,
        attendanceConflicts: 0,
      }),
      "approve",
    );

    assert.equal(result.workdayReconciliation.justified, 2);
  });

  it("throws ABSENCE_WORKDAY_SYNC_FAILED when reconciliation fails after mutation", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");

    await assert.rejects(
      () =>
        absenceWorkdaySyncService.runAfterAbsenceMutation(
          "company-1",
          "absence-1",
          async () => ({ id: "absence-1", status: "APPROVED" }),
          async () => {
            throw new Error("db unavailable");
          },
          "approve",
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, "ABSENCE_WORKDAY_SYNC_FAILED");
        assert.equal(error.details?.absenceRequestId, "absence-1");
        return true;
      },
    );
  });

  it("preserves an existing ABSENCE_WORKDAY_SYNC_FAILED AppError", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");
    const original = new AppError(503, "ABSENCE_WORKDAY_SYNC_FAILED", "sync failed", {
      absenceRequestId: "absence-1",
    });

    await assert.rejects(
      () =>
        absenceWorkdaySyncService.runAfterAbsenceMutation(
          "company-1",
          "absence-1",
          async () => ({ id: "absence-1" }),
          async () => {
            throw original;
          },
          "approve",
        ),
      (error: unknown) => error === original,
    );
  });

  it("does not run reconciliation when loadResult fails", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");
    let reconcileCalls = 0;

    await assert.rejects(() =>
      absenceWorkdaySyncService.runAfterAbsenceMutation(
        "company-1",
        "absence-1",
        async () => {
          throw new Error("mutation failed");
        },
        async () => {
          reconcileCalls += 1;
          return {
            justified: 0,
            restored: 0,
            relinked: 0,
            unchanged: 0,
            attendanceConflicts: 0,
          };
        },
        "approve",
      ),
    );

    assert.equal(reconcileCalls, 0);
  });
});
