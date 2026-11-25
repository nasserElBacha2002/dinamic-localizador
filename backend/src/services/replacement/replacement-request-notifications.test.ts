import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldUseInteractivePrimary,
  isReplacementInteractiveTemplateConfigured,
} from "./replacement-request-notifications";

describe("replacement notification primary policy", () => {
  it("only enables interactive buttons for exactly three candidates", () => {
    assert.equal(shouldUseInteractivePrimary(0), false);
    assert.equal(shouldUseInteractivePrimary(1), false);
    assert.equal(shouldUseInteractivePrimary(2), false);
    assert.equal(shouldUseInteractivePrimary(3), isReplacementInteractiveTemplateConfigured());
  });
});