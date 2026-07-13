import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperationEmployeeAssignment } from "../../types/operation";
import {
  resolveAssignmentAction,
  resolveAssignmentBatchStatus,
} from "./operation-assignment-display";

function assignment(
  overrides: Partial<OperationEmployeeAssignment> = {},
): OperationEmployeeAssignment {
  return {
    id: "assignment-1",
    companyId: "company-1",
    operationId: "operation-1",
    employeeId: "employee-1",
    validFrom: "2026-07-13",
    validUntil: null,
    assignedAt: "2026-07-13T00:00:00.000Z",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    cancelledAt: null,
    lifecycleState: "CURRENT",
    assignmentOrigin: "MANUAL",
    ...overrides,
  };
}

describe("resolveAssignmentBatchStatus", () => {
  it("returns success when nothing was skipped", () => {
    assert.equal(resolveAssignmentBatchStatus(3, 0), "success");
  });

  it("returns partial when some succeeded and some were skipped", () => {
    assert.equal(resolveAssignmentBatchStatus(2, 1), "partial");
  });

  it("returns error when everything was skipped", () => {
    assert.equal(resolveAssignmentBatchStatus(0, 2), "error");
  });
});

describe("resolveAssignmentAction", () => {
  it("offers ending an open-ended recurring current assignment", () => {
    const action = resolveAssignmentAction(
      assignment({ validFrom: "2026-01-01", validUntil: null }),
      "2026-07-13",
    );
    assert.equal(action, "end");
  });

  it("offers removing a one-time current assignment", () => {
    const action = resolveAssignmentAction(
      assignment({ validFrom: "2026-07-13", validUntil: "2026-07-13" }),
      "2026-07-13",
    );
    assert.equal(action, "cancel-current");
  });

  it("returns no action for cancelled assignments", () => {
    const action = resolveAssignmentAction(
      assignment({ cancelledAt: "2026-07-13T00:00:00.000Z" }),
      "2026-07-13",
    );
    assert.equal(action, null);
  });
});
