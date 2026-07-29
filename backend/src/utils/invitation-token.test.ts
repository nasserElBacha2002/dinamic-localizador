import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateInvitationToken,
  hashInvitationToken,
  redactInvitationSecrets,
} from "./invitation-token";

describe("invitation-token", () => {
  it("generates high-entropy opaque tokens", () => {
    const a = generateInvitationToken();
    const b = generateInvitationToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 40);
  });

  it("hashes deterministically without storing plaintext", () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);
    assert.equal(hash.length, 64);
    assert.equal(hashInvitationToken(token), hash);
    assert.notEqual(hash, token);
  });

  it("redacts tokens from log-like strings", () => {
    const token = generateInvitationToken();
    const url = `https://app.example/invitations/accept?token=${token}&x=1`;
    const redacted = redactInvitationSecrets(url);
    assert.equal(redacted.includes(token), false);
    assert.match(redacted, /REDACTED/);
  });
});
