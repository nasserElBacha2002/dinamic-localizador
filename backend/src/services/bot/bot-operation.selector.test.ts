import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidOperationSelection } from "./bot-operation.selector";

describe("isValidOperationSelection", () => {
  it("accepts valid selection index", () => {
    assert.equal(isValidOperationSelection(1, 3), true);
    assert.equal(isValidOperationSelection(3, 3), true);
  });

  it("rejects out of range or invalid values", () => {
    assert.equal(isValidOperationSelection(0, 3), false);
    assert.equal(isValidOperationSelection(4, 3), false);
    assert.equal(isValidOperationSelection(null, 3), false);
  });
});
