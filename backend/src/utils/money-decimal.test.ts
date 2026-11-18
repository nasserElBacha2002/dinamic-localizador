import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumDecimalStrings } from "./money-decimal";

describe("sumDecimalStrings", () => {
  it("sums without floating-point drift", () => {
    assert.equal(sumDecimalStrings(["0.1", "0.2"]), "0.3");
    assert.equal(sumDecimalStrings(["0.005", "0.005", "0.005"]), "0.015");
  });
});