import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDurationFromMinutes } from "./duration";

describe("formatDurationFromMinutes", () => {
  it("formats hours and minutes without premature rounding", () => {
    assert.equal(formatDurationFromMinutes(0), "0 h");
    assert.equal(formatDurationFromMinutes(90), "1 h 30 min");
    assert.equal(formatDurationFromMinutes(480), "8 h");
    assert.equal(formatDurationFromMinutes(30), "30 min");
  });
});
