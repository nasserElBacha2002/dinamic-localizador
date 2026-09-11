import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSensitiveSystemLogKey,
  maskEmailForLog,
  sanitizeSystemLogMetadata,
  sanitizeSystemLogMessage,
  serializeErrorForSystemLog,
} from "./sanitize";

describe("system-logs sanitize", () => {
  it("detects sensitive keys case-insensitively", () => {
    assert.equal(isSensitiveSystemLogKey("authToken"), true);
    assert.equal(isSensitiveSystemLogKey("AUTH_TOKEN"), true);
    assert.equal(isSensitiveSystemLogKey("connectionString"), true);
    assert.equal(isSensitiveSystemLogKey("module"), false);
  });

  it("redacts nested secrets and arrays", () => {
    const sanitized = sanitizeSystemLogMetadata({
      ok: "value",
      nested: {
        password: "super-secret",
        token: "tok-123",
        list: [{ apiKey: "key-1" }, { safe: true }],
      },
      authorization: "Bearer abc",
    });
    assert.ok(sanitized);
    assert.equal(sanitized.ok, "value");
    const nested = sanitized.nested as Record<string, unknown>;
    assert.equal(nested.password, "[REDACTED]");
    assert.equal(nested.token, "[REDACTED]");
    const list = nested.list as Array<Record<string, unknown>>;
    assert.equal(list[0].apiKey, "[REDACTED]");
    assert.equal(list[1].safe, true);
    assert.equal(sanitized.authorization, "[REDACTED]");
  });

  it("handles circular objects without throwing", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const sanitized = sanitizeSystemLogMetadata(circular);
    assert.ok(sanitized);
    assert.equal(sanitized.self, "[Circular]");
  });

  it("masks phones and emails in free text", () => {
    const masked = sanitizeSystemLogMessage(
      "Contact +5491112345678 or user@example.com with Bearer eyJhbGciOiJIUzI1NiJ9.abc",
    );
    assert.ok(!masked.includes("+5491112345678"));
    assert.ok(!masked.includes("user@example.com"));
    assert.ok(masked.includes("[REDACTED]"));
    assert.ok(maskEmailForLog("ab@test.com").includes("***@"));
  });

  it("serializes Error stacks with truncation and masking", () => {
    const err = new Error("authToken=secret-value failed for +5491199988877");
    err.stack = `${err.stack}\npassword=leak`;
    const serialized = serializeErrorForSystemLog(err, 200);
    assert.ok(serialized);
    assert.equal(serialized.name, "Error");
    assert.ok(!serialized.message.includes("secret-value"));
    assert.ok(serialized.stack);
    assert.ok(!serialized.stack.includes("password=leak"));
    assert.ok(serialized.stack.includes("[REDACTED]") || serialized.stack.includes("password=[REDACTED]"));
  });

  it("limits metadata size", () => {
    const big = { blob: "x".repeat(20_000) };
    const sanitized = sanitizeSystemLogMetadata(big, { maxMetadataBytes: 500 });
    assert.ok(sanitized);
    assert.equal(sanitized.__truncated__, true);
    assert.ok(typeof sanitized.preview === "string");
  });
});
