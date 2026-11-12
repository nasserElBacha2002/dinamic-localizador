import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentPeriodsOverlap } from "../../utils/operations/assignment-period";

describe("operationChargeAssignmentService overlap rules", () => {
  it("detects duplicate equivalent period as already_assigned", () => {
    const conflict = assignmentPeriodsOverlap({
      existing: { validFrom: "2026-01-01", validUntil: null, cancelledAt: null },
      requested: { validFrom: "2026-01-01", validUntil: null },
    });
    assert.equal(conflict, "already_assigned");
  });

  it("detects partial overlap as assignment_period_overlap", () => {
    const conflict = assignmentPeriodsOverlap({
      existing: { validFrom: "2026-01-01", validUntil: "2026-01-31", cancelledAt: null },
      requested: { validFrom: "2026-01-15", validUntil: null },
    });
    assert.equal(conflict, "assignment_period_overlap");
  });

  it("ignores cancelled existing rows", () => {
    const conflict = assignmentPeriodsOverlap({
      existing: {
        validFrom: "2026-01-01",
        validUntil: null,
        cancelledAt: "2026-01-10T12:00:00.000Z",
      },
      requested: { validFrom: "2026-01-01", validUntil: null },
    });
    assert.equal(conflict, "no_overlap");
  });
});
