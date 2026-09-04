import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeRetentionCutoff } from "./retention-cutoff";

describe("retention-cutoff", () => {
  it("computeRetentionCutoff uses UTC calendar days", () => {
    const now = new Date("2026-08-28T15:00:00.000Z");
    const cutoff = computeRetentionCutoff(now, 30);
    assert.equal(cutoff.toISOString(), "2026-07-29T15:00:00.000Z");
  });
});
