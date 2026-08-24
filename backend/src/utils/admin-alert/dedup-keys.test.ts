import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildForwardedLocationDedupKey,
  buildMissingCheckinDedupKey,
  buildUnavailableDedupKey,
} from "./dedup-keys";

describe("admin alert dedup keys", () => {
  it("builds unavailable key with schedule version", () => {
    assert.equal(
      buildUnavailableDedupKey("assignment-1", 2),
      "unavailable:assignment-1:2",
    );
  });

  it("builds missing checkin key from employee workday", () => {
    assert.equal(buildMissingCheckinDedupKey("ew-1"), "missing-checkin:ew-1");
  });

  it("builds forwarded key with hour bucket", () => {
    const at = new Date("2026-08-24T14:30:00.000Z");
    const key = buildForwardedLocationDedupKey("emp-1", at);
    assert.match(key, /^forwarded:emp-1:\d{10}$/);
  });
});
