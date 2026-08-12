import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WHATSAPP_PROVIDER_STATUS_RANK } from "../constants/whatsapp-observability";
import {
  buildProviderEventKey,
  createCorrelationId,
  hashPhoneForObservability,
  maskPhoneForObservability,
  monotonicProviderStatusAdvanceSql,
  pickProjectedProviderStatus,
  sanitizeObservabilityPayload,
  truncateJson,
} from "../utils/whatsapp-observability";

describe("whatsapp-observability utils", () => {
  it("creates unique correlation ids", () => {
    const a = createCorrelationId();
    const b = createCorrelationId();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f-]{36}$/i);
  });

  it("hashes phones stably with salt", () => {
    const hashA = hashPhoneForObservability("+5491112345678", "salt");
    const hashB = hashPhoneForObservability("+5491112345678", "salt");
    const hashC = hashPhoneForObservability("+5491112345678", "other");
    assert.equal(hashA, hashB);
    assert.notEqual(hashA, hashC);
  });

  it("masks phones", () => {
    const masked = maskPhoneForObservability("+5491112345678");
    assert.match(masked, /^\+54911/);
    assert.ok(masked.includes("******"));
  });

  it("sanitizes secrets and truncates", () => {
    const sanitized = sanitizeObservabilityPayload(
      {
        Authorization: "secret-token",
        body: "ok",
      },
      4000,
    );
    assert.ok(sanitized);
    assert.ok(sanitized.includes("[REDACTED]"));
    assert.ok(sanitized.includes("ok"));
  });

  it("truncates long json", () => {
    const truncated = truncateJson({ value: "x".repeat(5000) }, 100);
    assert.ok(truncated);
    assert.ok(truncated.length <= 100);
    assert.ok(truncated.includes("[truncated]"));
  });

  it("builds stable provider event keys", () => {
    const keyA = buildProviderEventKey({
      messageSid: "SM123",
      status: "delivered",
      errorCode: null,
      providerTimestamp: "2026-01-01T00:00:00Z",
    });
    const keyB = buildProviderEventKey({
      messageSid: "SM123",
      status: "delivered",
      errorCode: null,
      providerTimestamp: "2026-01-01T00:00:00Z",
    });
    assert.equal(keyA, keyB);
  });

  it("projects provider status without discarding terminal failures", () => {
    assert.equal(
      pickProjectedProviderStatus("sent", "delivered", WHATSAPP_PROVIDER_STATUS_RANK),
      "delivered",
    );
    assert.equal(
      pickProjectedProviderStatus("delivered", "failed", WHATSAPP_PROVIDER_STATUS_RANK),
      "failed",
    );
    assert.equal(
      pickProjectedProviderStatus("failed", "read", WHATSAPP_PROVIDER_STATUS_RANK),
      "failed",
    );
  });

  it("builds monotonic advance SQL that compares ranks and protects failures", () => {
    const sql = monotonicProviderStatusAdvanceSql("provider_status", "@providerStatus");
    assert.match(sql, /provider_status IS NULL/i);
    assert.match(sql, /N'failed'/i);
    assert.match(sql, /WHEN N'delivered' THEN 50/i);
  });
});
