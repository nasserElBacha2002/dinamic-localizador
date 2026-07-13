import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkTeamAssignConfirmResult } from "../../types/work-team";

const isConfirmResultShape = (value: unknown): value is WorkTeamAssignConfirmResult => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as WorkTeamAssignConfirmResult;
  return (
    typeof result.batchId === "string" &&
    typeof result.operationId === "string" &&
    Array.isArray(result.addedEmployees) &&
    Array.isArray(result.skippedEmployees) &&
    typeof result.summary === "object" &&
    result.summary !== null &&
    typeof result.summary.requested === "number" &&
    typeof result.summary.added === "number" &&
    typeof result.summary.skipped === "number"
  );
};

describe("work team assignment confirm contract", () => {
  it("accepts idempotent first and retry responses with the same shape", () => {
    const first: WorkTeamAssignConfirmResult = {
      batchId: "batch-1",
      operationId: "operation-1",
      addedEmployees: [
        {
          employeeId: "emp-1",
          assignmentId: "assignment-1",
          workTeamId: "team-a",
          workTeamIds: ["team-a", "team-b"],
        },
      ],
      skippedEmployees: [],
      summary: { requested: 1, added: 1, skipped: 0 },
    };

    const retry: WorkTeamAssignConfirmResult = {
      batchId: "batch-1",
      operationId: "operation-1",
      addedEmployees: first.addedEmployees,
      skippedEmployees: [],
      summary: { requested: 1, added: 1, skipped: 0 },
    };

    assert.equal(isConfirmResultShape(first), true);
    assert.equal(isConfirmResultShape(retry), true);
    assert.deepEqual(Object.keys(first).sort(), Object.keys(retry).sort());
  });
});
