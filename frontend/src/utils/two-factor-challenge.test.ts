import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearTwoFactorChallenge,
  persistTwoFactorChallenge,
  readTwoFactorChallenge,
} from "./two-factor-challenge";

describe("two-factor challenge storage", () => {
  it("uses a dedicated sessionStorage key", () => {
    persistTwoFactorChallenge("challenge-token");
    assert.equal(readTwoFactorChallenge(), "challenge-token");
    assert.equal(sessionStorage.getItem("dinamic_auth_token"), null);
    clearTwoFactorChallenge();
    assert.equal(readTwoFactorChallenge(), null);
  });
});
