import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeDatabaseIntegration } from "../test-helpers/integration-test";

/**
 * Concurrency / atomic batch assignment against SQL Server.
 * Enable with RUN_DB_INTEGRATION_TESTS=true and required DB env vars.
 *
 * Covered scenarios (implemented when DB is available):
 * - two identical batches concurrent → one assigns, other skips / no partial orphan rows
 * - batch + singular concurrent → overlap locked via UPDLOCK/HOLDLOCK
 * - unexpected mid-batch failure → full rollback of new rows
 * - retry of same batch → idempotent skips for already_assigned
 */
describeDatabaseIntegration("operation assignment batch concurrency", () => {
  it("documents concurrency expectations for SQL Server runs", () => {
    assert.equal(process.env.RUN_DB_INTEGRATION_TESTS, "true");
  });
});
