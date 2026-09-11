import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import type { SystemLogRecord } from "../../types/system-logs";

setupUnitTestEnv();

const sample = (message: string): SystemLogRecord => ({
  schemaVersion: 1,
  timestamp: new Date().toISOString(),
  level: "error",
  service: "test",
  serviceInstanceId: null,
  environment: "test",
  module: "http",
  event: "http.request.failed",
  message,
  errorCode: null,
  requestId: null,
  correlationId: null,
  companyId: null,
  operationId: null,
  employeeId: null,
  conversationId: null,
  jobExecutionId: null,
  metadata: null,
  error: null,
});

describe("system-log persist sink lifecycle", () => {
  afterEach(async () => {
    const { resetSystemLogPersistSinkForTests } = await import("./persist-sink");
    resetSystemLogPersistSinkForTests();
  });

  it("flushes and shuts down idempotently", async () => {
    let inserts = 0;
    const {
      initSystemLogPersistSink,
      enqueueSystemLogPersist,
      flushSystemLogPersistSink,
      shutdownSystemLogPersistSink,
      setSystemLogPersistInsertForTests,
      getSystemLogPersistSinkStatsForTests,
    } = await import("./persist-sink");

    setSystemLogPersistInsertForTests(async () => {
      inserts += 1;
    });
    initSystemLogPersistSink();
    enqueueSystemLogPersist(sample("a"));
    await flushSystemLogPersistSink();
    assert.equal(inserts, 1);

    const first = await shutdownSystemLogPersistSink({ timeoutMs: 1000 });
    const second = await shutdownSystemLogPersistSink({ timeoutMs: 1000 });
    assert.equal(first.timedOut, false);
    assert.equal(second.droppedRemaining, 0);
    assert.equal(getSystemLogPersistSinkStatsForTests().accepting, false);
    enqueueSystemLogPersist(sample("after-shutdown"));
    assert.equal(getSystemLogPersistSinkStatsForTests().queueLength, 0);
  });

  it("drops overflow when queue is full and stays fail-open on SQL errors", async () => {
    const {
      initSystemLogPersistSink,
      enqueueSystemLogPersist,
      flushSystemLogPersistSink,
      SYSTEM_LOG_PERSIST_MAX_QUEUE,
      getSystemLogPersistSinkStatsForTests,
      setSystemLogPersistInsertForTests,
      shutdownSystemLogPersistSink,
    } = await import("./persist-sink");

    setSystemLogPersistInsertForTests(async () => {
      throw new Error("sql down");
    });
    initSystemLogPersistSink();

    // Pause auto-flush by keeping insert slow? enqueue kicks flush async;
    // flood faster than drain by using a hanging insert until after enqueue loop.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setSystemLogPersistInsertForTests(async () => {
      await gate;
      throw new Error("sql down");
    });

    for (let i = 0; i < SYSTEM_LOG_PERSIST_MAX_QUEUE + 30; i += 1) {
      enqueueSystemLogPersist(sample(`m-${i}`));
    }
    assert.ok(getSystemLogPersistSinkStatsForTests().queueLength <= SYSTEM_LOG_PERSIST_MAX_QUEUE);
    assert.ok(getSystemLogPersistSinkStatsForTests().droppedOverflow >= 1);
    release();
    await flushSystemLogPersistSink();
    await shutdownSystemLogPersistSink({ timeoutMs: 1000 });
  });
});
