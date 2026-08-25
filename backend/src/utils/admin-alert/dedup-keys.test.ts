import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAbsencePendingDedupKey,
  buildAttendanceThresholdDedupKey,
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

  it("builds absence pending key from request id", () => {
    assert.equal(buildAbsencePendingDedupKey("req-1"), "absence-pending:req-1");
  });

  it("builds attendance threshold key with sequence", () => {
    assert.equal(
      buildAttendanceThresholdDedupKey("emp-1", 3),
      "attendance-threshold:emp-1:3",
    );
  });

  it("normalizes UUID case in dedup keys", () => {
    assert.equal(
      buildUnavailableDedupKey("ABCDEF12-3456-7890-ABCD-EF1234567890", 1),
      "unavailable:abcdef12-3456-7890-abcd-ef1234567890:1",
    );
  });
});
