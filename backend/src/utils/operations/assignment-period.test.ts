import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertValidAssignmentDateRange,
  assignmentPeriodsOverlap,
  doAssignmentPeriodsOverlap,
  isAssignmentActiveOnWorkDate,
  resolveAssignmentLifecycleState,
} from "./assignment-period";

describe("assignment-period", () => {
  it("treats inclusive ranges as active on boundary dates", () => {
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-07-01",
        validUntil: "2026-07-15",
        workDate: "2026-07-01",
      }),
      true,
    );
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-07-01",
        validUntil: "2026-07-15",
        workDate: "2026-07-15",
      }),
      true,
    );
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-07-01",
        validUntil: "2026-07-15",
        workDate: "2026-06-30",
      }),
      false,
    );
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-07-01",
        validUntil: "2026-07-15",
        workDate: "2026-07-16",
      }),
      false,
    );
  });

  it("supports same-day and open-ended assignments", () => {
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-07-06",
        validUntil: "2026-07-06",
        workDate: "2026-07-06",
      }),
      true,
    );
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-08-01",
        validUntil: null,
        workDate: "2026-08-10",
      }),
      true,
    );
  });

  it("detects overlaps including open-ended periods", () => {
    assert.equal(
      doAssignmentPeriodsOverlap({
        validFrom: "2026-07-01",
        validUntil: "2026-07-31",
        otherValidFrom: "2026-07-15",
        otherValidUntil: null,
      }),
      true,
    );
    assert.equal(
      doAssignmentPeriodsOverlap({
        validFrom: "2026-07-01",
        validUntil: "2026-07-15",
        otherValidFrom: "2026-07-16",
        otherValidUntil: null,
      }),
      false,
    );
  });

  it("classifies overlap outcomes with assignmentPeriodsOverlap", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-01", validUntil: "2026-07-10" },
        requested: { validFrom: "2026-08-01", validUntil: "2026-08-31" },
      }),
      "no_overlap",
    );
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-08-01", validUntil: "2026-08-31" },
        requested: { validFrom: "2026-08-01", validUntil: "2026-08-31" },
      }),
      "already_assigned",
    );
  });

  it("resolves lifecycle states from reference date", () => {
    assert.equal(
      resolveAssignmentLifecycleState(
        { validFrom: "2026-07-01", validUntil: "2026-07-15" },
        "2026-07-10",
      ),
      "CURRENT",
    );
    assert.equal(
      resolveAssignmentLifecycleState(
        { validFrom: "2026-08-01", validUntil: null },
        "2026-07-10",
      ),
      "FUTURE",
    );
    assert.equal(
      resolveAssignmentLifecycleState(
        { validFrom: "2026-06-01", validUntil: "2026-06-30" },
        "2026-07-10",
      ),
      "ENDED",
    );
  });

  it("rejects cancelled assignments on any work date", () => {
    assert.equal(
      isAssignmentActiveOnWorkDate({
        validFrom: "2026-07-01",
        validUntil: "2026-07-15",
        workDate: "2026-07-10",
        cancelledAt: "2026-07-09T10:00:00.000Z",
      }),
      false,
    );
    assert.equal(
      resolveAssignmentLifecycleState(
        {
          validFrom: "2026-07-01",
          validUntil: "2026-07-15",
          cancelledAt: "2026-07-09T10:00:00.000Z",
        },
        "2026-07-10",
      ),
      null,
    );
  });

  it("rejects invalid date ranges", () => {
    assert.throws(
      () => assertValidAssignmentDateRange("2026-07-10", "2026-07-09"),
      /ASSIGNMENT_INVALID_DATE_RANGE/,
    );
  });
});
