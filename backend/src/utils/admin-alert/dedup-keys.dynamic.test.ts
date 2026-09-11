import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConfirmationMissingDedupKey,
  buildMissingCheckinAfterStartDedupKey,
  buildMissingCheckoutAfterEndDedupKey,
} from "./dedup-keys";

describe("dynamic attendance dedup keys", () => {
  it("normalizes confirmation missing keys", () => {
    assert.equal(
      buildConfirmationMissingDedupKey("AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", 2),
      "confirmation-missing:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2",
    );
  });

  it("includes schedule version for check-in and check-out", () => {
    assert.equal(
      buildMissingCheckinAfterStartDedupKey("BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB", 3),
      "missing-checkin-after-start:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:3",
    );
    assert.equal(
      buildMissingCheckoutAfterEndDedupKey("BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB", 3),
      "missing-checkout-after-end:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:3",
    );
  });
});
