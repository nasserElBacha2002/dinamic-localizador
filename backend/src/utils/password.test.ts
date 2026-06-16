import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, normalizeEmail, verifyPassword } from "./password";

describe("password utils", () => {
  it("normalizes email to lowercase", () => {
    assert.equal(normalizeEmail(" Admin@Example.COM "), "admin@example.com");
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("secure-password");
    assert.notEqual(hash, "secure-password");
    assert.equal(await verifyPassword("secure-password", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });
});
