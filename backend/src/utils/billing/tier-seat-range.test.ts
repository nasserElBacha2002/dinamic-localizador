import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { doSeatRangesOverlap } from "./tier-seat-range";

describe("billing tier seat range overlap", () => {
  it("detects overlapping inclusive seat ranges", () => {
    const overlap = doSeatRangesOverlap({
      seatMin: 1,
      seatMax: 50,
      otherSeatMin: 40,
      otherSeatMax: 100,
    });
    assert.equal(overlap, true);
  });

  it("treats adjacent ranges as non-overlapping", () => {
    const overlap = doSeatRangesOverlap({
      seatMin: 1,
      seatMax: 50,
      otherSeatMin: 51,
      otherSeatMax: 100,
    });
    assert.equal(overlap, false);
  });

  it("treats null seat_max as open-ended", () => {
    const overlap = doSeatRangesOverlap({
      seatMin: 201,
      seatMax: null,
      otherSeatMin: 1,
      otherSeatMax: 500,
    });
    assert.equal(overlap, true);
  });
});
