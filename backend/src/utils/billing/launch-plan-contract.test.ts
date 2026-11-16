import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agreedAmountMatchesLaunchFixedPrice,
  isLaunchFixedMonthlyAmount,
  requiresNegotiatedSeatCapacity,
} from "./launch-plan-contract";

describe("launch plan contractual rules", () => {
  it("treats USD 300 as the fixed launch monthly amount", () => {
    assert.equal(isLaunchFixedMonthlyAmount("300"), true);
    assert.equal(isLaunchFixedMonthlyAmount("300.000000"), true);
    assert.equal(isLaunchFixedMonthlyAmount("3"), false);
    assert.equal(isLaunchFixedMonthlyAmount("30000"), false);
  });

  it("does not vary agreed amount with employee headcount up to 100", () => {
    assert.equal(agreedAmountMatchesLaunchFixedPrice("300.000000", 20), true);
    assert.equal(agreedAmountMatchesLaunchFixedPrice("300.000000", 60), true);
    assert.equal(agreedAmountMatchesLaunchFixedPrice("300.000000", 100), true);
    assert.equal(agreedAmountMatchesLaunchFixedPrice("3", 60), false);
  });

  it("requires negotiated terms when seat capacity exceeds 100", () => {
    assert.equal(requiresNegotiatedSeatCapacity(100), false);
    assert.equal(requiresNegotiatedSeatCapacity(101), true);
    assert.equal(requiresNegotiatedSeatCapacity(250), true);
    assert.equal(requiresNegotiatedSeatCapacity(null), false);
  });

  it("uses catalog capacity instead of a hardcoded launch constant", () => {
    assert.equal(requiresNegotiatedSeatCapacity(120, 150), false);
    assert.equal(requiresNegotiatedSeatCapacity(151, 150), true);
  });
});