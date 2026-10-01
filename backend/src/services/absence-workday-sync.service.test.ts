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
    const { absenceOperationalReconciliationService } = await import(
      "./absence-operational-reconciliation.service"
    );
    mock.method(
      absenceOperationalReconciliationService,
      "applyApprovedOperationalSideEffects",
      async () => undefined,
    );
    mock.method(
      absenceOperationalReconciliationService,
      "revertOperationalSideEffects",
      async () => undefined,
    );
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

  it("empty queue: one claim then stop (respects batch limit without N empty claims)", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncJobRepository } = await import(
      "../repositories/absence-workday-sync-job.repository"
    );
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");

    let claimCalls = 0;
    mock.method(absenceWorkdaySyncJobRepository, "recoverExpiredLeases", async () => 0);
    mock.method(absenceWorkdaySyncJobRepository, "claimNextPending", async () => {
      claimCalls += 1;
      return null;
    });

    const result = await absenceWorkdaySyncService.processPendingJobs(25);
    assert.equal(claimCalls, 1);
    assert.equal(result.processed, 0);
    assert.equal(result.failed, 0);
  });

  it("queue with work continues until empty and second tick still claims", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncJobRepository } = await import(
      "../repositories/absence-workday-sync-job.repository"
    );
    const { absenceOperationalReconciliationService } = await import(
      "./absence-operational-reconciliation.service"
    );
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");

    const jobs = [
      {
        id: "job-1",
        companyId: "c1",
        absenceRequestId: "a1",
        absenceStatus: "APPROVED",
        operation: "APPROVE" as const,
        status: "PROCESSING" as const,
        attemptCount: 0,
        lastError: null,
        expectedOperationalImpactVersion: 1,
        supersededAt: null,
        leaseOwner: "w",
        leaseExpiresAt: new Date().toISOString(),
        leaseVersion: 1,
        enqueueCommandId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "job-2",
        companyId: "c1",
        absenceRequestId: "a2",
        absenceStatus: "APPROVED",
        operation: "APPROVE" as const,
        status: "PROCESSING" as const,
        attemptCount: 0,
        lastError: null,
        expectedOperationalImpactVersion: 1,
        supersededAt: null,
        leaseOwner: "w",
        leaseExpiresAt: new Date().toISOString(),
        leaseVersion: 1,
        enqueueCommandId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    let claimCalls = 0;
    mock.method(absenceWorkdaySyncJobRepository, "recoverExpiredLeases", async () => 0);
    mock.method(absenceWorkdaySyncJobRepository, "claimNextPending", async () => {
      claimCalls += 1;
      return jobs.shift() ?? null;
    });
    mock.method(absenceWorkdaySyncJobRepository, "toLeaseToken", (job: { id: string }) => ({
      companyId: "c1",
      jobId: job.id,
      leaseOwner: "w",
      leaseVersion: 1,
    }));
    mock.method(absenceWorkdaySyncJobRepository, "markCompletedWithLease", async () => undefined);
    mock.method(
      absenceOperationalReconciliationService,
      "executeClaimedJob",
      async () => "APPLIED" as const,
    );

    const first = await absenceWorkdaySyncService.processPendingJobs(10);
    assert.equal(first.processed, 2);
    assert.equal(claimCalls, 3); // 2 jobs + 1 empty terminator

    const claimCallsAfterFirst = claimCalls;
    const second = await absenceWorkdaySyncService.processPendingJobs(10);
    assert.equal(second.processed, 0);
    assert.equal(claimCalls, claimCallsAfterFirst + 1);
  });

  it("respects max batch limit when queue stays full", async () => {
    setupUnitTestEnv();
    const { absenceWorkdaySyncJobRepository } = await import(
      "../repositories/absence-workday-sync-job.repository"
    );
    const { absenceOperationalReconciliationService } = await import(
      "./absence-operational-reconciliation.service"
    );
    const { absenceWorkdaySyncService } = await import("./absence-workday-sync.service");

    let claimCalls = 0;
    mock.method(absenceWorkdaySyncJobRepository, "recoverExpiredLeases", async () => 0);
    mock.method(absenceWorkdaySyncJobRepository, "claimNextPending", async () => {
      claimCalls += 1;
      return {
        id: `job-${claimCalls}`,
        companyId: "c1",
        absenceRequestId: `a-${claimCalls}`,
        absenceStatus: "APPROVED",
        operation: "APPROVE" as const,
        status: "PROCESSING" as const,
        attemptCount: 0,
        lastError: null,
        expectedOperationalImpactVersion: 1,
        supersededAt: null,
        leaseOwner: "w",
        leaseExpiresAt: new Date().toISOString(),
        leaseVersion: 1,
        enqueueCommandId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    mock.method(absenceWorkdaySyncJobRepository, "toLeaseToken", (job: { id: string }) => ({
      companyId: "c1",
      jobId: job.id,
      leaseOwner: "w",
      leaseVersion: 1,
    }));
    mock.method(absenceWorkdaySyncJobRepository, "markCompletedWithLease", async () => undefined);
    mock.method(
      absenceOperationalReconciliationService,
      "executeClaimedJob",
      async () => "APPLIED" as const,
    );

    const result = await absenceWorkdaySyncService.processPendingJobs(3);
    assert.equal(result.processed, 3);
    assert.equal(claimCalls, 3);
  });
});
