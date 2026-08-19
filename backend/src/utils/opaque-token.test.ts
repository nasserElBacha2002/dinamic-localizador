import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateOpaqueToken, hashOpaqueToken, redactOpaqueSecrets } from "./opaque-token";

describe("opaque-token", () => {
  it("generates a URL-safe token of at least 32 bytes of entropy", () => {
    const token = generateOpaqueToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.ok(token.length >= 43);
    assert.notEqual(token, generateOpaqueToken());
  });

  it("hashes with SHA-256 hex", () => {
    const token = generateOpaqueToken();
    const hash = hashOpaqueToken(token);
    assert.equal(hash.length, 64);
    assert.equal(hash, hashOpaqueToken(token));
    assert.notEqual(hash, token);
  });

  it("redacts reset URLs and long tokens from log strings", () => {
    const token = generateOpaqueToken();
    const url = `https://app.example/reset-password?token=${token}`;
    const redacted = redactOpaqueSecrets(url);
    assert.equal(redacted.includes(token), false);
    assert.match(redacted, /token=\[REDACTED\]/);
  });
});
