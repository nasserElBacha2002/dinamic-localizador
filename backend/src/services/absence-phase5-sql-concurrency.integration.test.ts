/**
 * Phase 5 closure — SQL concurrency / worker lease evidence.
 * Enabled with: RUN_DB_INTEGRATION_TESTS=true
 *
 * Requires an existing APPROVED absence request in the company (seeded env):
 * - TEST_COMPANY_ID
 * - TEST_ABSENCE_REQUEST_ID
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { getPool, initializeDatabase } from "../database/connection";
import { absenceWorkdaySyncJobRepository } from "../repositories/absence-workday-sync-job.repository";

const canRun =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  Boolean(process.env.TEST_COMPANY_ID) &&
  Boolean(process.env.TEST_ABSENCE_REQUEST_ID);

describe("phase5 closure sql concurrency / worker lease", { skip: !canRun }, () => {
  const companyId = String(process.env.TEST_COMPANY_ID);
  const absenceRequestId = String(process.env.TEST_ABSENCE_REQUEST_ID);
  const createdJobIds: string[] = [];

  before(async () => {
    await initializeDatabase();
  });

  after(async () => {
    if (!createdJobIds.length) {
      return;
    }
    const pool = getPool();
    for (const jobId of createdJobIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, jobId)
        .query(`DELETE FROM absence_workday_sync_jobs WHERE id = @id`);
    }
  });

  it("two concurrent claims never return the same job id", async () => {
    const job = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "MANUAL_RECONCILE",
      expectedOperationalImpactVersion: 990001,
    });
    createdJobIds.push(job.id);

    const [first, second] = await Promise.all([
      absenceWorkdaySyncJobRepository.claimNextPending(5, {
        leaseOwner: `w1-${randomUUID()}`,
        leaseSeconds: 60,
      }),
      absenceWorkdaySyncJobRepository.claimNextPending(5, {
        leaseOwner: `w2-${randomUUID()}`,
        leaseSeconds: 60,
      }),
    ]);

    if (first && second) {
      assert.notEqual(first.id, second.id);
    } else {
      assert.ok(first || second);
    }
  });

  it("expired lease allows recovery claim by another worker", async () => {
    const job = await absenceWorkdaySyncJobRepository.enqueue({
      companyId,
      absenceRequestId,
      absenceStatus: "APPROVED",
      operation: "MANUAL_RECONCILE",
      expectedOperationalImpactVersion: 990002,
    });
    createdJobIds.push(job.id);

    const claimed = await absenceWorkdaySyncJobRepository.claimNextPending(5, {
      leaseOwner: `crash-${randomUUID()}`,
      leaseSeconds: 1,
    });
    assert.ok(claimed);
    assert.equal(claimed.id, job.id);
    assert.equal(claimed.status, "PROCESSING");

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, claimed.id)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET lease_expires_at = DATEADD(SECOND, -5, SYSUTCDATETIME())
        WHERE id = @id
      `);

    const recovered = await absenceWorkdaySyncJobRepository.claimNextPending(5, {
      leaseOwner: `recovery-${randomUUID()}`,
      leaseSeconds: 60,
    });
    assert.ok(recovered);
    assert.equal(recovered.id, claimed.id);
    assert.equal(recovered.status, "PROCESSING");
  });
});
