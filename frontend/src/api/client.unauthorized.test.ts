import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldClearSessionOn401 } from "./client";

describe("shouldClearSessionOn401", () => {
  it("does not log out on 2FA or password step-up failures", () => {
    assert.equal(shouldClearSessionOn401(401, "INVALID_TWO_FACTOR_CODE"), false);
    assert.equal(shouldClearSessionOn401(401, "INVALID_CREDENTIALS"), false);
    assert.equal(shouldClearSessionOn401(401, "INVALID_TWO_FACTOR_CHALLENGE"), false);
  });

  it("logs out when the session JWT is actually invalid", () => {
    assert.equal(shouldClearSessionOn401(401, "INVALID_TOKEN"), true);
    assert.equal(shouldClearSessionOn401(401, "UNAUTHORIZED"), true);
    assert.equal(shouldClearSessionOn401(401, undefined), true);
  });

  it("ignores non-401 responses", () => {
    assert.equal(shouldClearSessionOn401(403, "INVALID_TWO_FACTOR_CODE"), false);
    assert.equal(shouldClearSessionOn401(200, "INVALID_TOKEN"), false);
  });
});
