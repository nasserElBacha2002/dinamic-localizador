import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ABSENCE_ACTIVE_OVERLAP_STATUSES,
  ABSENCE_ADMIN_EDITABLE_STATUSES,
  assertAbsenceTransition,
  getAbsenceTransition,
  isAbsenceAdminEditableStatus,
  isAbsenceReviewableStatus,
  toAbsenceStatusSqlInList,
} from "./absence-transitions";
import { AppError } from "../errors/app-error";

describe("absence transitions policy", () => {
  it("allows PENDING review actions including NEEDS_INFO", () => {
    assert.equal(assertAbsenceTransition("APPROVE", "PENDING").to, "APPROVED");
    assert.equal(assertAbsenceTransition("REJECT", "PENDING").to, "REJECTED");
    assert.equal(assertAbsenceTransition("NEEDS_INFO", "PENDING").to, "NEEDS_INFO");
    assert.equal(assertAbsenceTransition("CANCEL", "PENDING").to, "CANCELLED");
  });

  it("allows NEEDS_INFO approve/reject/cancel but not NEEDS_INFO→NEEDS_INFO", () => {
    assert.equal(assertAbsenceTransition("APPROVE", "NEEDS_INFO").to, "APPROVED");
    assert.equal(assertAbsenceTransition("REJECT", "NEEDS_INFO").to, "REJECTED");
    assert.equal(assertAbsenceTransition("CANCEL", "NEEDS_INFO").to, "CANCELLED");
    assert.throws(
      () => assertAbsenceTransition("NEEDS_INFO", "NEEDS_INFO"),
      (error: unknown) => error instanceof AppError && error.code === "ABSENCE_INVALID_TRANSITION",
    );
  });

  it("uses UPDATE_NEEDS_INFO_COMMENT to refresh comment without leaving NEEDS_INFO", () => {
    const rule = assertAbsenceTransition("UPDATE_NEEDS_INFO_COMMENT", "NEEDS_INFO");
    assert.equal(rule.to, "NEEDS_INFO");
    assert.equal(rule.requiresComment, true);
    assert.equal(rule.triggersReconciliation, false);
  });

  it("resubmits to PENDING and auto-approves only from PENDING", () => {
    const resubmit = assertAbsenceTransition("RESUBMIT", "NEEDS_INFO");
    assert.equal(resubmit.to, "PENDING");
    assert.equal(resubmit.eventType, "RESUBMITTED");
    const auto = assertAbsenceTransition("AUTO_APPROVE", "PENDING");
    assert.equal(auto.to, "APPROVED");
    assert.equal(auto.eventType, "APPROVED");
    assert.throws(() => assertAbsenceTransition("AUTO_APPROVE", "NEEDS_INFO"), AppError);
  });

  it("rejects transitions from terminal statuses", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED"] as const) {
      assert.equal(isAbsenceReviewableStatus(status), false);
      assert.throws(() => assertAbsenceTransition("APPROVE", status), AppError);
    }
  });

  it("exposes fromStatusesForUpdate from the policy rule", () => {
    const rule = assertAbsenceTransition("APPROVE", "PENDING");
    assert.deepEqual(rule.fromStatusesForUpdate, [...getAbsenceTransition("APPROVE").from]);
  });

  it("includes NEEDS_INFO in active overlap statuses", () => {
    assert.ok(ABSENCE_ACTIVE_OVERLAP_STATUSES.includes("NEEDS_INFO"));
    assert.equal(ABSENCE_ACTIVE_OVERLAP_STATUSES.includes("REJECTED" as never), false);
  });

  it("marks only NEEDS_INFO as admin-editable", () => {
    assert.deepEqual([...ABSENCE_ADMIN_EDITABLE_STATUSES], ["NEEDS_INFO"]);
    assert.equal(isAbsenceAdminEditableStatus("NEEDS_INFO"), true);
    assert.equal(isAbsenceAdminEditableStatus("PENDING"), false);
  });

  it("builds SQL fragments only from known enums", () => {
    assert.equal(toAbsenceStatusSqlInList(["PENDING", "NEEDS_INFO"]), "'PENDING', 'NEEDS_INFO'");
    assert.throws(() => toAbsenceStatusSqlInList(["HACKED" as never]));
  });
});
