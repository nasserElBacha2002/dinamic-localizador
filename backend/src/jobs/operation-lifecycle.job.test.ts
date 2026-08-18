import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("operation lifecycle job", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("skips a tick while a previous run is still in progress", async () => {
    setupUnitTestEnv();
    const { operationLifecycleService } = await import("../services/operation-lifecycle.service");

    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    mock.method(operationLifecycleService, "reconcileDue", async () => {
      started += 1;
      await gate;
      return {
        operationsScanned: 0,
        operationsUpdated: 0,
        operationsSkipped: 0,
        operationsFailed: 0,
        batches: 0,
        durationMs: 1,
        backlogRemaining: 0,
      };
    });

    const { runOperationLifecycleJobOnce } = await import("./operation-lifecycle.job");
    const first = runOperationLifecycleJobOnce();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = runOperationLifecycleJobOnce();
    await second;
    release();
    await first;

    assert.equal(started, 1);
  });
});
