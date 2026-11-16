import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSeatCapacity,
  assertValidEffectiveInstant,
  SQL_INT_MAX,
} from "./catalog-input";

describe("billing catalog input validation", () => {
  it("rejects invalid effective instants", () => {
    assert.throws(() => assertValidEffectiveInstant(new Date("invalid")), /invalid effective instant/);
  });

  it("rejects non-integer seat capacities", () => {
    assert.throws(() => assertSeatCapacity(1.5, 10), /invalid integer/);
  });

  it("rejects seat capacities above SQL INT", () => {
    assert.throws(() => assertSeatCapacity(SQL_INT_MAX + 1, null), /invalid integer/);
  });
});
