import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { Company } from "../types/company";
import { isCompanyOperationallyActive } from "../types/company";

setupUnitTestEnv();

const baseCompany = (overrides: Partial<Company> = {}): Company => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acme Ops",
  legalName: null,
  taxId: null,
  country: null,
  defaultTimezone: "America/Argentina/Buenos_Aires",
  status: "ACTIVE",
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivationReason: null,
  scheduledDeletionAt: null,
  reactivatedAt: null,
  reactivatedByUserId: null,
  deletionStartedAt: null,
  deletedAt: null,
  deletionAttempts: 0,
  deletionLastError: null,
  deletionPurgeStage: null,
  deletionNextAttemptAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("companyLifecycleService corrections", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("computes scheduled deletion from injectable clock via computeScheduledDeletionAt", async () => {
    const { computeScheduledDeletionAt } = await import("./company-lifecycle.service");
    const { env } = await import("../config/env");
    const now = new Date("2026-08-05T12:00:00.000Z");
    const scheduled = computeScheduledDeletionAt(now, env.COMPANY_DELETION_GRACE_PERIOD_DAYS);
    assert.equal(
      scheduled.getTime(),
      now.getTime() + env.COMPANY_DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("is idempotent on second deactivate without moving scheduledDeletionAt", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLifecycleService } = await import("./company-lifecycle.service");

    const pending = baseCompany({
      status: "PENDING_DELETION",
      deactivatedAt: "2026-08-01T00:00:00.000Z",
      scheduledDeletionAt: "2026-08-31T00:00:00.000Z",
      deactivationReason: "Original",
    });
    mock.method(companyRepository, "findById", async () => pending);
    const scheduleSpy = mock.method(companyRepository, "scheduleDeletion", async () => {
      throw new Error("should not schedule again");
    });

    const result = await companyLifecycleService.deactivate(
      pending.id,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "Otro motivo",
      () => new Date("2026-08-05T12:00:00.000Z"),
    );

    assert.equal(result.scheduledDeletionAt, "2026-08-31T00:00:00.000Z");
    assert.equal(result.deactivationReason, "Original");
    assert.equal(scheduleSpy.mock.callCount(), 0);
  });

  it("rejects protected company by ID", async () => {
    const { env } = await import("../config/env");
    const original = env.COMPANY_PROTECTED_IDS;
    (env as { COMPANY_PROTECTED_IDS: string }).COMPANY_PROTECTED_IDS =
      "11111111-1111-4111-8111-111111111111";
    try {
      const { companyRepository } = await import("../repositories/company.repository");
      const { companyLifecycleService } = await import("./company-lifecycle.service");
      mock.method(companyRepository, "findById", async () =>
        baseCompany({ name: "Renamed Corp", status: "ACTIVE" }),
      );
      await assert.rejects(
        () =>
          companyLifecycleService.deactivate(
            "11111111-1111-4111-8111-111111111111",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "No",
          ),
        (error: unknown) => error instanceof AppError && error.code === "COMPANY_PROTECTED",
      );
    } finally {
      (env as { COMPANY_PROTECTED_IDS: string }).COMPANY_PROTECTED_IDS = original;
    }
  });

  it("rejects reactivation while DELETING", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLifecycleService } = await import("./company-lifecycle.service");
    mock.method(companyRepository, "findById", async () => baseCompany({ status: "DELETING" }));
    await assert.rejects(
      () =>
        companyLifecycleService.reactivate(
          "11111111-1111-4111-8111-111111111111",
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMPANY_DELETION_IN_PROGRESS",
    );
  });

  it("reactivates idempotently when already ACTIVE", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLifecycleService } = await import("./company-lifecycle.service");
    mock.method(companyRepository, "findById", async () => baseCompany({ status: "ACTIVE" }));
    const result = await companyLifecycleService.reactivate(
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    assert.equal(result.status, "ACTIVE");
  });

  it("does not process deletions before due time when claim returns null", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLifecycleService } = await import("./company-lifecycle.service");
    mock.method(companyRepository, "claimNextDueForDeletion", async () => null);
    const result = await companyLifecycleService.processDueDeletions(
      () => new Date("2026-08-05T12:00:00.000Z"),
    );
    assert.deepEqual(result, { processed: 0, succeeded: 0, failed: 0 });
  });

  it("marks deletion failed when purge throws after claim and lease still held", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLifecycleService } = await import("./company-lifecycle.service");
    const { companyDeletionPurgeService } = await import("./company-deletion-purge.service");

    let claimCalls = 0;
    mock.method(companyRepository, "claimNextDueForDeletion", async () => {
      claimCalls += 1;
      if (claimCalls === 1) {
        return baseCompany({
          status: "DELETING",
          deletionAttempts: 1,
          scheduledDeletionAt: "2026-08-01T00:00:00.000Z",
          deletionPurgeStage: "STORAGE_DISCOVERY",
        });
      }
      return null;
    });
    mock.method(companyDeletionPurgeService, "purgeCompany", async () => {
      throw new Error("temporary storage failure");
    });
    const failSpy = mock.method(companyRepository, "markDeletionFailed", async () => true);

    const result = await companyLifecycleService.processDueDeletions(
      () => new Date("2026-08-05T12:00:00.000Z"),
    );

    assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 1 });
    assert.equal(failSpy.mock.callCount(), 1);
    const nextAttempt = failSpy.mock.calls[0]?.arguments[3] as { nextAttemptAt: Date };
    assert.ok(nextAttempt.nextAttemptAt instanceof Date);
  });

  it("skips markDeletionFailed when lease was lost", async () => {
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyLifecycleService } = await import("./company-lifecycle.service");
    const { companyDeletionPurgeService, LeaseLostError } = await import(
      "./company-deletion-purge.service"
    );

    let claimCalls = 0;
    mock.method(companyRepository, "claimNextDueForDeletion", async () => {
      claimCalls += 1;
      if (claimCalls === 1) {
        return baseCompany({ status: "DELETING", deletionAttempts: 1 });
      }
      return null;
    });
    mock.method(companyDeletionPurgeService, "purgeCompany", async () => {
      throw new LeaseLostError("11111111-1111-4111-8111-111111111111");
    });
    const failSpy = mock.method(companyRepository, "markDeletionFailed", async () => true);

    const result = await companyLifecycleService.processDueDeletions(
      () => new Date("2026-08-05T12:00:00.000Z"),
    );
    assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 0 });
    assert.equal(failSpy.mock.callCount(), 0);
  });
});

describe("operational company gate contract", () => {
  it("only ACTIVE is operationally active", () => {
    assert.equal(isCompanyOperationallyActive("ACTIVE"), true);
    for (const status of [
      "INACTIVE",
      "SUSPENDED",
      "PENDING_DELETION",
      "DELETING",
      "DELETED",
      "DELETION_FAILED",
    ] as const) {
      assert.equal(isCompanyOperationallyActive(status), false);
    }
  });

  it("isStorageObjectNotFoundError recognizes GCS and typed codes", async () => {
    const { AppError: AE } = await import("../errors/app-error");
    const { isStorageObjectNotFoundError, StorageObjectNotFoundError } = await import(
      "./attachment-storage/storage-errors"
    );
    assert.equal(isStorageObjectNotFoundError(new StorageObjectNotFoundError("k")), true);
    assert.equal(
      isStorageObjectNotFoundError(new AE(404, "GCS_OBJECT_NOT_FOUND", "missing")),
      true,
    );
    assert.equal(isStorageObjectNotFoundError(new Error("404 not found")), false);
  });
});
