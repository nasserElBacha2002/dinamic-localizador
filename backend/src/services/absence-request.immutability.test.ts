import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbsenceReviewableStatus } from "../constants/absence-transitions";
import { absenceRequestRepository } from "../repositories/absence-request.repository";

describe("approved absence mutability", () => {
  it("does not expose an update endpoint for approved absence coverage fields", () => {
    const repositoryMethods = Object.keys(absenceRequestRepository);
    assert.equal(repositoryMethods.includes("updateCoverage"), false);
    assert.equal(repositoryMethods.includes("updateDates"), false);
    assert.equal(repositoryMethods.includes("updateStatus"), true);
  });

  it("documents that approved absences are not reviewable through cancel/reject flows", () => {
    assert.equal(isAbsenceReviewableStatus("APPROVED"), false);
    assert.equal(isAbsenceReviewableStatus("PENDING"), true);
    assert.equal(isAbsenceReviewableStatus("NEEDS_INFO"), true);
  });
});
