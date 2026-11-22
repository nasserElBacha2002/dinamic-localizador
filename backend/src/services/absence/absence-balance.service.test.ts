import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBalanceCounters } from "../../utils/absence/absence-balance.utils";

describe("absence balance phase 2 stabilization (unit)", () => {
  it("calculates balance counters for assigned 14, approved 5, pending 2", () => {
    assert.deepEqual(
      computeBalanceCounters({ assignedDays: 14, approvedDays: 5, pendingDays: 2 }),
      { availableDays: 9, projectedAvailableDays: 7 },
    );
  });
});
