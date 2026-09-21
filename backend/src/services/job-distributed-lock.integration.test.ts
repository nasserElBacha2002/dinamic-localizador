/**
 * Distributed job app-lock — SQL Server integration (Phase 4B.1 / LOC-P1-004).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import {
  ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE,
  RECURRING_WORKDAY_MATERIALIZATION_LOCK_RESOURCE,
} from "../constants/job-locks";
import {
  acquireDedicatedSessionAppLockForTests,
  withDedicatedSessionAppLock,
} from "../utils/whatsapp-retention-lock";

describeDatabaseIntegration("phase-4b job distributed locks (SQL)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("simultaneous acquisition: only one worker holds recurring materialization lock", async () => {
    const held = await acquireDedicatedSessionAppLockForTests(
      RECURRING_WORKDAY_MATERIALIZATION_LOCK_RESOURCE,
    );
    try {
      const skipped = await withDedicatedSessionAppLock(
        RECURRING_WORKDAY_MATERIALIZATION_LOCK_RESOURCE,
        async () => "should-not-run",
        { lockTimeoutMs: 0 },
      );
      assert.equal(skipped.outcome, "skipped");
    } finally {
      await held.release();
    }

    const acquired = await withDedicatedSessionAppLock(
      RECURRING_WORKDAY_MATERIALIZATION_LOCK_RESOURCE,
      async () => "ok",
      { lockTimeoutMs: 0 },
    );
    assert.equal(acquired.outcome, "locked");
    if (acquired.outcome === "locked") {
      assert.equal(acquired.value, "ok");
    }
  });

  it("crash recovery: lock released after connection close allows reacquire", async () => {
    const held = await acquireDedicatedSessionAppLockForTests(
      ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE,
    );
    // Simulate crash: close connection without explicit release (session lock dies with session).
    await held.connection.close();

    const next = await withDedicatedSessionAppLock(
      ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE,
      async () => "recovered",
      { lockTimeoutMs: 5_000 },
    );
    assert.equal(next.outcome, "locked");
    if (next.outcome === "locked") {
      assert.equal(next.value, "recovered");
    }
  });

  it("scope isolation: distinct job resources can be held concurrently", async () => {
    const a = await acquireDedicatedSessionAppLockForTests(
      RECURRING_WORKDAY_MATERIALIZATION_LOCK_RESOURCE,
    );
    try {
      const b = await withDedicatedSessionAppLock(
        ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE,
        async () => "independent",
        { lockTimeoutMs: 0 },
      );
      assert.equal(b.outcome, "locked");
    } finally {
      await a.release();
    }
  });
});
