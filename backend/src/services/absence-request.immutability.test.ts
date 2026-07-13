import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absenceRequestRepository } from "../repositories/absence-request.repository";

describe("approved absence mutability", () => {
  it("does not expose an update endpoint for approved absence coverage fields", () => {
    const repositoryMethods = Object.keys(absenceRequestRepository);
    assert.equal(repositoryMethods.includes("updateCoverage"), false);
    assert.equal(repositoryMethods.includes("updateDates"), false);
    assert.equal(repositoryMethods.includes("updateStatus"), true);
  });

  it("documents that approved absences are not reviewable through cancel/reject flows", async () => {
    const { REVIEWABLE_STATUSES } = await import("./absence-request.service");
    assert.equal(REVIEWABLE_STATUSES.includes("APPROVED"), false);
    assert.equal(REVIEWABLE_STATUSES.includes("PENDING"), true);
  });
});
