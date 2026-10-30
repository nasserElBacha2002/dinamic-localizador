import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAvailableAfterApproval,
  computeBalanceCounters,
  getAbsenceRequestYear,
  hasSufficientBalanceForApproval,
} from "./absence-balance.utils";

describe("computeBalanceCounters", () => {
  it("calculates available and projected balances", () => {
    assert.deepEqual(
      computeBalanceCounters({ assignedDays: 14, approvedDays: 5, pendingDays: 2 }),
      { availableDays: 9, projectedAvailableDays: 7 },
    );
  });

  it("defaults assigned days to zero when no balance row exists", () => {
    assert.deepEqual(
      computeBalanceCounters({ assignedDays: 0, approvedDays: 3, pendingDays: 1 }),
      { availableDays: -3, projectedAvailableDays: -4 },
    );
  });
});

describe("hasSufficientBalanceForApproval", () => {
  it("blocks approval when balance is insufficient", () => {
    assert.equal(
      hasSufficientBalanceForApproval({ assignedDays: 14, approvedDays: 12, requestDays: 3 }),
      false,
    );
  });

  it("allows approval when balance is sufficient", () => {
    assert.equal(
      hasSufficientBalanceForApproval({ assignedDays: 14, approvedDays: 5, requestDays: 3 }),
      true,
    );
  });
});

describe("computeAvailableAfterApproval", () => {
  it("does not subtract approved request twice", () => {
    assert.equal(
      computeAvailableAfterApproval({
        assignedDays: 14,
        approvedDays: 8,
        requestDays: 3,
        requestStatus: "APPROVED",
      }),
      6,
    );
  });

  it("subtracts pending request days from available balance", () => {
    assert.equal(
      computeAvailableAfterApproval({
        assignedDays: 14,
        approvedDays: 5,
        requestDays: 3,
        requestStatus: "PENDING",
      }),
      6,
    );
  });
});

describe("getAbsenceRequestYear", () => {
  it("uses start date year for MVP assignment", () => {
    assert.equal(getAbsenceRequestYear("2026-06-25"), 2026);
  });
});
