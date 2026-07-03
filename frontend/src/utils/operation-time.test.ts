import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeOperationTimeValue } from "./operation-time";

describe("normalizeOperationTimeValue", () => {
  it("normalizes HH:mm from time input", () => {
    assert.equal(normalizeOperationTimeValue("20:30"), "20:30");
    assert.equal(normalizeOperationTimeValue("03:00:00"), "03:00");
    assert.equal(normalizeOperationTimeValue("9:05"), "09:05");
  });

  it("returns empty string for empty input", () => {
    assert.equal(normalizeOperationTimeValue(""), "");
    assert.equal(normalizeOperationTimeValue("   "), "");
  });
});
