import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveAbsenceOperationalEffectPlan,
  resolveEmployeeAbsenceAvailabilityStatus,
} from "./absence-operational-effects";
import {
  buildOperationalConflictIdempotencyKey,
  buildOperationalEffectIdempotencyKey,
} from "../types/absence-operational-impact";

describe("absence operational effect matrix", () => {
  it("does not justify workdays for PENDING/NEEDS_INFO", () => {
    assert.equal(resolveAbsenceOperationalEffectPlan("PENDING").justifyWorkdays, false);
    assert.equal(resolveAbsenceOperationalEffectPlan("NEEDS_INFO").justifyWorkdays, false);
    assert.equal(resolveAbsenceOperationalEffectPlan("PENDING").createAssignmentConflicts, false);
  });

  it("justifies and creates conflicts only when APPROVED", () => {
    const plan = resolveAbsenceOperationalEffectPlan("APPROVED");
    assert.equal(plan.justifyWorkdays, true);
    assert.equal(plan.createAssignmentConflicts, true);
  });

  it("reverts on CANCELLED/REJECTED", () => {
    assert.equal(resolveAbsenceOperationalEffectPlan("CANCELLED").revertAppliedEffects, true);
    assert.equal(resolveAbsenceOperationalEffectPlan("REJECTED").revertAppliedEffects, true);
  });
});

describe("employee absence availability", () => {
  it("maps approved / provisional / available", () => {
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: true,
        hasPendingOrNeedsInfoCovering: false,
        hasPartialDayCovering: false,
      }),
      "UNAVAILABLE",
    );
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: false,
        hasPendingOrNeedsInfoCovering: true,
        hasPartialDayCovering: false,
      }),
      "PROVISIONALLY_UNAVAILABLE",
    );
    assert.equal(
      resolveEmployeeAbsenceAvailabilityStatus({
        employeeActive: true,
        hasApprovedCovering: false,
        hasPendingOrNeedsInfoCovering: false,
        hasPartialDayCovering: false,
      }),
      "AVAILABLE",
    );
  });
});

describe("operational idempotency keys", () => {
  it("builds stable keys", () => {
    assert.equal(
      buildOperationalEffectIdempotencyKey({
        requestId: "r1",
        version: 2,
        effectType: "ASSIGNMENT_CONFLICT",
        targetEntityId: "a1",
        action: "conflict",
      }),
      "absence:r1:2:ASSIGNMENT_CONFLICT:a1:conflict",
    );
    assert.equal(
      buildOperationalConflictIdempotencyKey({
        requestId: "r1",
        version: 2,
        conflictType: "ASSIGNMENT_DURING_ABSENCE",
        targetEntityId: "op1",
      }),
      "absence:r1:2:conflict:ASSIGNMENT_DURING_ABSENCE:op1",
    );
  });
});
