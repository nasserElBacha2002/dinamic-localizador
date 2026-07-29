import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAdminEditNeedsInfo,
  canReviewAbsences,
  canShowAbsenceReviewActions,
} from "./absence-review-permissions";
import { absenceConflictUserMessage } from "./absence-conflict-message";
import { ApiError } from "../../utils/errors";

describe("absence review permissions", () => {
  it("requires absences:review for review and balance edit actions", () => {
    assert.equal(canReviewAbsences(["absences:read"]), false);
    assert.equal(canReviewAbsences(["absences:review"]), true);
    assert.equal(canShowAbsenceReviewActions(["absences:review"], "PENDING"), true);
    assert.equal(canShowAbsenceReviewActions(["absences:review"], "APPROVED"), false);
    assert.equal(canAdminEditNeedsInfo(["absences:review"], "NEEDS_INFO"), true);
    assert.equal(canAdminEditNeedsInfo(["absences:review"], "PENDING"), false);
  });
});

describe("absence conflict messages", () => {
  it("maps 403 and 409 to clear Spanish messages", () => {
    assert.match(absenceConflictUserMessage(new ApiError("x", "FORBIDDEN", 403)), /permiso/i);
    assert.match(
      absenceConflictUserMessage(new ApiError("conflicto", "ABSENCE_ALREADY_REVIEWED", 409)),
      /conflicto|cambió/i,
    );
  });
});
