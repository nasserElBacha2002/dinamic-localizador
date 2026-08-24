import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { decryptProtectedSecret, encryptProtectedSecret } from "./protected-secret";

describe("protected-secret AES-256-GCM", () => {
  it("round-trips plaintext and uses a distinct nonce each time", () => {
    const first = encryptProtectedSecret("totp-secret-value");
    const second = encryptProtectedSecret("totp-secret-value");
    assert.notEqual(first, second);
    assert.equal(decryptProtectedSecret(first), "totp-secret-value");
    assert.equal(decryptProtectedSecret(second), "totp-secret-value");
    assert.equal(first.startsWith("v1."), true);
  });

  it("rejects a tampered ciphertext", () => {
    const payload = encryptProtectedSecret("totp-secret-value");
    const parts = payload.split(".");
    const mutated = Buffer.from(parts[3], "base64url");
    mutated[0] = mutated[0] ^ 0xff;
    parts[3] = mutated.toString("base64url");
    assert.throws(() => decryptProtectedSecret(parts.join(".")));
  });
});
