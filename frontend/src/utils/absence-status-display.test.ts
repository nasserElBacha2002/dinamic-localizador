import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absenceStatusTone } from "./absence-status-display";

describe("absenceStatusTone", () => {
  it("maps known absence statuses to semantic tones", () => {
    assert.equal(absenceStatusTone("PENDING"), "warning");
    assert.equal(absenceStatusTone("APPROVED"), "success");
    assert.equal(absenceStatusTone("REJECTED"), "danger");
    assert.equal(absenceStatusTone("NEEDS_INFO"), "info");
    assert.equal(absenceStatusTone("CANCELLED"), "neutral");
  });
});
