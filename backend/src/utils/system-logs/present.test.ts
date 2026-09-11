import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("system-logs present (read-path sanitize)", () => {
  let toSystemRuntimeLogDetail: typeof import("./present").toSystemRuntimeLogDetail;
  let toSystemRuntimeLogSummary: typeof import("./present").toSystemRuntimeLogSummary;

  before(async () => {
    const mod = await import("./present");
    toSystemRuntimeLogDetail = mod.toSystemRuntimeLogDetail;
    toSystemRuntimeLogSummary = mod.toSystemRuntimeLogSummary;
  });

  it("redacts contaminated SQL payloads on detail and summary", () => {
    const raw = {
      id: "11111111-1111-1111-1111-111111111111",
      schemaVersion: 1,
      occurredAt: "2026-09-11T12:00:00.000Z",
      level: "error",
      service: "api",
      serviceInstanceId: null,
      environment: "test",
      module: "http",
      event: "http.request.failed",
      message:
        "authToken=leak-me Bearer eyJhbGciOiJIUzI1NiJ9.abc failed +5491112345678 user@example.com",
      errorCode: "X",
      requestId: "req-12345678",
      correlationId: null,
      companyId: null,
      operationId: null,
      employeeId: null,
      conversationId: null,
      jobExecutionId: null,
      metadataJson: JSON.stringify({
        authToken: "secret-token",
        Authorization: "Bearer abc",
        password: "pw",
        connectionString: "Server=secret;",
        signedUrl: "https://example.com/x?sig=abc",
        nested: { apiKey: "k" },
        latitude: -34.6,
        email: "a@b.com",
      }),
      errorName: "Error",
      errorMessage: "password=bad connectionString=Server=x",
      errorStack: "Error: password=bad\n at fn",
      createdAt: "2026-09-11T12:00:01.000Z",
    };

    const detail = toSystemRuntimeLogDetail(raw);
    const summary = toSystemRuntimeLogSummary(raw);
    const detailJson = JSON.stringify(detail);
    const summaryJson = JSON.stringify(summary);

    for (const blob of [detailJson, summaryJson]) {
      assert.ok(!blob.includes("secret-token"));
      assert.ok(!blob.includes("Server=secret"));
      assert.ok(!blob.includes("leak-me"));
      assert.ok(!blob.includes("+5491112345678"));
      assert.ok(!blob.includes("user@example.com"));
    }

    assert.equal((detail.metadata as { authToken: string }).authToken, "[REDACTED]");
    assert.equal((detail.metadata as { latitude: string }).latitude, "[REDACTED]");
    assert.equal(Object.prototype.hasOwnProperty.call(summary, "metadata"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, "errorStack"), false);
  });

  it("handles corrupt metadata_json without throwing", () => {
    const detail = toSystemRuntimeLogDetail({
      id: "11111111-1111-1111-1111-111111111111",
      schemaVersion: 1,
      occurredAt: "2026-09-11T12:00:00.000Z",
      level: "warn",
      service: "api",
      serviceInstanceId: null,
      environment: "test",
      module: "http",
      event: "http.request.rejected",
      message: "ok",
      errorCode: null,
      requestId: null,
      correlationId: null,
      companyId: null,
      operationId: null,
      employeeId: null,
      conversationId: null,
      jobExecutionId: null,
      metadataJson: "{not-json",
      errorName: null,
      errorMessage: null,
      errorStack: null,
      createdAt: "2026-09-11T12:00:01.000Z",
    });
    assert.deepEqual(detail.metadata, { __parseError: true });
  });
});
