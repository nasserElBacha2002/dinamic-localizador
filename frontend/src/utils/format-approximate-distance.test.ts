import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatApproximateDistance } from "./format-approximate-distance";

describe("formatApproximateDistance", () => {
  it("returns null for missing or invalid values", () => {
    assert.equal(formatApproximateDistance(null), null);
    assert.equal(formatApproximateDistance(undefined), null);
    assert.equal(formatApproximateDistance(Number.NaN), null);
    assert.equal(formatApproximateDistance(-1), null);
  });

  it("formats meters under 1 km", () => {
    assert.equal(formatApproximateDistance(0), "~0 m");
    assert.equal(formatApproximateDistance(350), "~350 m");
    assert.equal(formatApproximateDistance(999), "~999 m");
  });

  it("formats kilometers with es-AR decimal comma under 10 km", () => {
    assert.equal(formatApproximateDistance(1000), "~1 km");
    assert.equal(formatApproximateDistance(1200), "~1,2 km");
    assert.equal(formatApproximateDistance(2450), "~2,5 km");
    assert.equal(formatApproximateDistance(9990), "~10 km");
  });

  it("rounds whole kilometers from 10 km up", () => {
    assert.equal(formatApproximateDistance(10000), "~10 km");
    assert.equal(formatApproximateDistance(25000), "~25 km");
  });
});
