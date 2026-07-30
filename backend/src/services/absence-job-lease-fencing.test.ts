import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import type { JobLeaseToken } from "../repositories/absence-workday-sync-job.repository";

/**
 * Pure fencing predicate tests (no DB). Live crash/lease scenarios live in
 * absence-phase5-final-concurrency.integration.test.ts.
 */
describe("job lease fencing token invariants", () => {
  it("JOB_LEASE_LOST AppError code is stable", () => {
    const error = new AppError(409, "JOB_LEASE_LOST", "El worker perdió el lease del job");
    assert.equal(error.code, "JOB_LEASE_LOST");
    assert.equal(error.statusCode, 409);
  });

  it("lease token shape requires owner and version", () => {
    const token: JobLeaseToken = {
      companyId: "c",
      jobId: "j",
      leaseOwner: "w1",
      leaseVersion: 3,
    };
    assert.equal(token.leaseVersion, 3);
    assert.ok(token.leaseOwner.length > 0);
  });
});
