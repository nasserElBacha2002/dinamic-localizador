import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { SYSTEM_LOG_RETENTION_LOCK_RESOURCE } from "../constants/system-logs";
import { acquireDedicatedSessionAppLockForTests } from "../utils/whatsapp-retention-lock";

describeDatabaseIntegration("system log retention lease", () => {
  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("skips when another replica holds the session app lock", async () => {
    const held = await acquireDedicatedSessionAppLockForTests(SYSTEM_LOG_RETENTION_LOCK_RESOURCE);
    try {
      const { systemLogsService } = await import("../services/system-logs.service");
      const result = await systemLogsService.runRetention();
      assert.equal(result.lockSkipped, true);
      assert.equal(result.deleted, 0);
    } finally {
      await held.release();
    }

    const { systemLogsService } = await import("../services/system-logs.service");
    const afterRelease = await systemLogsService.runRetention();
    assert.equal(afterRelease.lockSkipped, false);
  });
});
