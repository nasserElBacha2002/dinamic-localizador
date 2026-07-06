import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidInventorySelection } from "./bot-operation.selector";

describe("isValidInventorySelection", () => {
  it("accepts valid selection index", () => {
    assert.equal(isValidInventorySelection(1, 3), true);
    assert.equal(isValidInventorySelection(3, 3), true);
  });

  it("rejects out of range or invalid values", () => {
    assert.equal(isValidInventorySelection(0, 3), false);
    assert.equal(isValidInventorySelection(4, 3), false);
    assert.equal(isValidInventorySelection(null, 3), false);
  });
});
