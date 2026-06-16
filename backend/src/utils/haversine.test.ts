import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateDistanceMeters, InvalidCoordinatesError } from "./haversine";

describe("calculateDistanceMeters", () => {
  it("returns approximately zero for same coordinate", () => {
    const distance = calculateDistanceMeters(-34.5876, -58.4102, -34.5876, -58.4102);
    assert.ok(distance < 1);
  });

  it("calculates a known distance approximately", () => {
    const distance = calculateDistanceMeters(-34.6037, -58.3816, -34.5876, -58.4102);
    assert.ok(distance > 2500);
    assert.ok(distance < 4000);
  });

  it("rejects invalid latitude", () => {
    assert.throws(
      () => calculateDistanceMeters(120, -58.4102, -34.5876, -58.4102),
      InvalidCoordinatesError,
    );
  });
});
