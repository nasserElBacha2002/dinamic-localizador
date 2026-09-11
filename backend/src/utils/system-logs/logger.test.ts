import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

setupUnitTestEnv();
process.env.SYSTEM_LOGS_ENABLED = "true";
process.env.SYSTEM_LOGS_PERSIST_LEVELS = "error,warn,info";
process.env.SYSTEM_LOGS_INFO_EVENT_ALLOWLIST = "allowed.info.event";

describe("systemLogger", () => {
  let systemLogger: typeof import("./logger").systemLogger;
  let registerSystemLogPersistSink: typeof import("./logger").registerSystemLogPersistSink;
  let buildSystemLogRecordForTests: typeof import("./logger").buildSystemLogRecordForTests;
  let runWithRequestLogContext: typeof import("./request-log-context").runWithRequestLogContext;
  let isSafeRequestId: typeof import("./request-log-context").isSafeRequestId;
  let createRequestId: typeof import("./request-log-context").createRequestId;

  before(async () => {
    const loggerMod = await import("./logger");
    const ctxMod = await import("./request-log-context");
    systemLogger = loggerMod.systemLogger;
    registerSystemLogPersistSink = loggerMod.registerSystemLogPersistSink;
    buildSystemLogRecordForTests = loggerMod.buildSystemLogRecordForTests;
    runWithRequestLogContext = ctxMod.runWithRequestLogContext;
    isSafeRequestId = ctxMod.isSafeRequestId;
    createRequestId = ctxMod.createRequestId;
  });

  afterEach(() => {
    registerSystemLogPersistSink(null);
  });

  it("builds required fields and merges ALS requestId", () => {
    const record = runWithRequestLogContext(
      {
        requestId: "req-abc-123456",
        correlationId: "corr-xyz-987654",
        jobExecutionId: null,
      },
      () =>
        buildSystemLogRecordForTests({
          level: "error",
          module: "http",
          event: "http.request.failed",
          message: "boom",
        }),
    );
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.level, "error");
    assert.equal(record.module, "http");
    assert.equal(record.event, "http.request.failed");
    assert.equal(record.requestId, "req-abc-123456");
    assert.equal(record.correlationId, "corr-xyz-987654");
    assert.ok(record.timestamp);
    assert.ok(record.service);
    assert.ok(record.environment);
  });

  it("redacts secrets before emit and never persists sensitive metadata", () => {
    const persisted: unknown[] = [];
    registerSystemLogPersistSink((row) => {
      persisted.push(row);
    });

    const record = systemLogger.error({
      module: "twilio-outbound",
      event: "twilio.message.send.failed",
      message: "send failed authToken=should-not-leak",
      metadata: {
        authToken: "TWILIO_SECRET",
        nested: { password: "pw", safe: 1 },
      },
      error: new Error("connectionString=Server=secret;"),
    });

    const asJson = JSON.stringify(record);
    assert.ok(!asJson.includes("TWILIO_SECRET"));
    assert.ok(!asJson.includes("Server=secret"));
    assert.equal((record.metadata as { authToken: string }).authToken, "[REDACTED]");
    assert.equal(persisted.length, 1);
    assert.ok(!JSON.stringify(persisted[0]).includes("TWILIO_SECRET"));
  });

  it("persists INFO only when event is allowlisted", () => {
    const persisted: string[] = [];
    registerSystemLogPersistSink((row) => {
      persisted.push(row.event);
    });

    systemLogger.info({
      module: "http",
      event: "not.allowed",
      message: "skip persist",
    });
    systemLogger.info({
      module: "system-log-retention",
      event: "allowed.info.event",
      message: "persist me",
    });

    assert.deepEqual(persisted, ["allowed.info.event"]);
  });

  it("does not throw when persist sink fails", () => {
    registerSystemLogPersistSink(() => {
      throw new Error("sql down");
    });
    assert.doesNotThrow(() => {
      systemLogger.error({
        module: "http",
        event: "http.request.failed",
        message: "still ok",
      });
    });
  });

  it("validates request id format", () => {
    assert.equal(isSafeRequestId("short"), false);
    assert.equal(isSafeRequestId("a".repeat(100)), false);
    assert.equal(isSafeRequestId("req id with spaces!!"), false);
    assert.equal(isSafeRequestId("abcdef12-3456"), true);
    assert.ok(isSafeRequestId(createRequestId()));
  });
});
