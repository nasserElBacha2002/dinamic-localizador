/**
 * WhatsApp retention distributed lock — SQL Server integration.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { WHATSAPP_RETENTION_LOCK_RESOURCE } from "../constants/whatsapp-retention";
import { whatsappRetentionService } from "./whatsapp-retention.service";
import {
  acquireDedicatedSessionAppLockForTests,
  withDedicatedSessionAppLock,
} from "../utils/whatsapp-retention-lock";

describeDatabaseIntegration("whatsapp retention distributed lock (SQL)", () => {
  const nowUtc = new Date("2026-08-28T12:00:00.000Z");

  before(async () => {
    process.env.WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED = "true";
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("Runner B gets lockSkipped while Runner A holds the lock; Runner C succeeds after release", async () => {
    const runnerA = await acquireDedicatedSessionAppLockForTests(WHATSAPP_RETENTION_LOCK_RESOURCE);
    try {
      const runnerB = await whatsappRetentionService.runCleanup({ dryRun: true, nowUtc });
      assert.equal(runnerB.lockSkipped, true);
      assert.equal(runnerB.skipped, undefined);
    } finally {
      await runnerA.release();
    }

    const runnerC = await whatsappRetentionService.runCleanup({ dryRun: true, nowUtc });
    assert.notEqual(runnerC.lockSkipped, true);
  });

  it("releases session lock when cleanup throws so a later runner can acquire", async () => {
    await assert.rejects(
      () =>
        withDedicatedSessionAppLock(WHATSAPP_RETENTION_LOCK_RESOURCE, async () => {
          throw new Error("SIMULATED_CLEANUP_FAILURE");
        }),
      /SIMULATED_CLEANUP_FAILURE/,
    );

    const next = await acquireDedicatedSessionAppLockForTests(WHATSAPP_RETENTION_LOCK_RESOURCE);
    await next.release();
  });
});
