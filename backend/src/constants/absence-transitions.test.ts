import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABSENCE_ACTIVE_OVERLAP_STATUSES,
  ABSENCE_EDITABLE_STATUSES,
  ABSENCE_REVIEWABLE_STATUSES,
  assertAbsenceTransition,
  isAbsenceEditableStatus,
  isAbsenceReviewableStatus,
} from "../constants/absence-transitions";
import { AppError } from "../errors/app-error";

describe("absence transitions policy", () => {
  it("allows approve/reject/needs-info/cancel from PENDING and NEEDS_INFO", () => {
    for (const status of ABSENCE_REVIEWABLE_STATUSES) {
      assert.equal(assertAbsenceTransition("APPROVE", status).to, "APPROVED");
      assert.equal(assertAbsenceTransition("REJECT", status).to, "REJECTED");
      assert.equal(assertAbsenceTransition("NEEDS_INFO", status).to, "NEEDS_INFO");
      assert.equal(assertAbsenceTransition("CANCEL", status).to, "CANCELLED");
    }
  });

  it("allows resubmit only from NEEDS_INFO to PENDING", () => {
    assert.equal(assertAbsenceTransition("RESUBMIT", "NEEDS_INFO").to, "PENDING");
    assert.throws(
      () => assertAbsenceTransition("RESUBMIT", "PENDING"),
      (error: unknown) => error instanceof AppError && error.code === "ABSENCE_INVALID_TRANSITION",
    );
  });

  it("rejects transitions from terminal statuses", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED"] as const) {
      assert.equal(isAbsenceReviewableStatus(status), false);
      assert.throws(() => assertAbsenceTransition("APPROVE", status), AppError);
    }
  });

  it("includes NEEDS_INFO in active overlap statuses", () => {
    assert.ok(ABSENCE_ACTIVE_OVERLAP_STATUSES.includes("NEEDS_INFO"));
    assert.ok(ABSENCE_ACTIVE_OVERLAP_STATUSES.includes("PENDING"));
    assert.ok(ABSENCE_ACTIVE_OVERLAP_STATUSES.includes("APPROVED"));
    assert.equal(ABSENCE_ACTIVE_OVERLAP_STATUSES.includes("REJECTED" as never), false);
  });

  it("marks only NEEDS_INFO as editable", () => {
    assert.deepEqual([...ABSENCE_EDITABLE_STATUSES], ["NEEDS_INFO"]);
    assert.equal(isAbsenceEditableStatus("NEEDS_INFO"), true);
    assert.equal(isAbsenceEditableStatus("PENDING"), false);
  });
});
