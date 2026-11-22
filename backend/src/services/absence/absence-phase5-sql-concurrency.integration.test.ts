/**
 * Phase 5 closure — SQL concurrency / worker lease evidence.
 * Enable: RUN_DB_INTEGRATION_TESTS=true (ephemeral database).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../../database/connection";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { absenceWorkdaySyncJobRepository } from "../../repositories/absence/absence-workday-sync-job.repository";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-7)}9`;

describeDatabaseIntegration("phase5 closure sql concurrency / worker lease", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let absenceRequestId = "";
  const createdJobIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    companyId = await requireDinamicCompanyId();
    const pool = getPool();

    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone())
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Phase5 lease emp', @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(emp.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const typeRow = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types
        WHERE company_id = @companyId AND is_active = 1
      `);
    const absenceTypeId = String(typeRow.recordset[0]?.id ?? "");
    assert.ok(absenceTypeId);

    const workDate = new Date().toISOString().slice(0, 10);

    const created = await absenceRequestRepository.create(companyId, {
      employeeId,
      absenceTypeId,
      startDate: workDate,
      endDate: workDate,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
      totalDays: 1,
      reason: "phase5 worker lease integration",
      requestedVia: "ADMIN",
    });

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, created.id)
      .query(`
        UPDATE absence_requests
        SET status = N'APPROVED',
            operational_impact_version = 1,
            reviewed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    absenceRequestId = created.id;
  });

  after(async () => {
    if (createdJobIds.length) {
      const pool = getPool();
      for (const jobId of createdJobIds) {
        await pool
          .request()
          .input("id", sql.UniqueIdentifier, jobId)
          .query(`DELETE FROM absence_workday_sync_jobs WHERE id = @id`);
      }
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
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

    const pool = getPool();
    for (const claimed of [first, second].filter(Boolean)) {
      await pool.request().input("id", sql.UniqueIdentifier, claimed!.id).query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'COMPLETED',
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
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

    const resetToPending = await absenceWorkdaySyncJobRepository.recoverExpiredLeases(50, 5);
    assert.ok(resetToPending >= 1);

    const recovered = await absenceWorkdaySyncJobRepository.claimNextPending(5, {
      leaseOwner: `recovery-${randomUUID()}`,
      leaseSeconds: 60,
    });
    assert.ok(recovered);
    assert.equal(recovered.id, claimed.id);
    assert.equal(recovered.status, "PROCESSING");
  });
});