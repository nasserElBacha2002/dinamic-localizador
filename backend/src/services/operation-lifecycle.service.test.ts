import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { operationRepository } from "../repositories/operation.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { mockAdminAlertSideEffects } from "../test-helpers/mock-admin-alert-side-effects";
import type { Operation } from "../types/domain";

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";

const makeOperation = (overrides: Partial<Operation> = {}): Operation => ({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  serviceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-08-13T23:50:00.000Z",
  scheduledEnd: "2026-08-14T06:00:00.000Z",
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 30,
  status: "SCHEDULED",
  createdAt: "2026-08-13T12:00:00.000Z",
  updatedAt: "2026-08-13T12:00:00.000Z",
  ...overrides,
});

const dueRow = (operation: Operation, companyId = COMPANY_ID) => ({
  companyId,
  operation,
  sortKey: new Date(operation.scheduledEnd ?? operation.scheduledStart ?? 0),
});

const paddedId = (index: number): string =>
  `aaaaaaaa-aaaa-aaaa-aaaa-${String(index).padStart(12, "0")}`;

const prepareLifecycleTest = async (): Promise<void> => {
  setupUnitTestEnv();
  await mockAdminAlertSideEffects();
};

describe("operationLifecycleService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("case 1: never consulted SCHEDULED becomes COMPLETED after scheduledEnd", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const operation = makeOperation();
    const promotions: string[] = [];
    mock.method(operationRepository, "promoteLifecycleStatus", async (_c, id, from, to) => {
      promotions.push(`${from}->${to}`);
      return { ...operation, id, status: to, updatedAt: "2026-08-16T00:00:00.000Z" };
    });

    const result = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      operation,
      new Date("2026-08-16T00:00:00.000Z"),
    );

    assert.equal(result.status, "COMPLETED");
    assert.deepEqual(promotions, ["SCHEDULED->COMPLETED"]);
  });

  it("case 2: SCHEDULED → IN_PROGRESS → COMPLETED across the clock", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    let current = makeOperation();
    mock.method(operationRepository, "promoteLifecycleStatus", async (_c, id, from, to) => {
      current = { ...current, id, status: to };
      return current;
    });

    const inProgress = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      current,
      new Date("2026-08-14T01:00:00.000Z"),
    );
    assert.equal(inProgress.status, "IN_PROGRESS");

    const completed = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      inProgress,
      new Date("2026-08-14T06:00:00.000Z"),
    );
    assert.equal(completed.status, "COMPLETED");
  });

  it("case 3: downtime backlog SCHEDULED from 48h ago becomes COMPLETED", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const stale = makeOperation({
      scheduledStart: "2026-08-05T23:50:00.000Z",
      scheduledEnd: "2026-08-06T06:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
    });
    let remaining: Operation[] = [stale];
    mock.method(operationRepository, "listOneTimeLifecycleDue", async () =>
      remaining.map((operation) => dueRow(operation)),
    );
    mock.method(operationRepository, "promoteLifecycleStatus", async (_c, _id, _from, to) => {
      remaining = [];
      return { ...stale, status: to };
    });
    mock.method(operationRepository, "countOneTimeLifecycleDue", async () => remaining.length);

    const result = await operationLifecycleService.reconcileDue({
      now: new Date("2026-08-08T06:00:00.000Z"),
    });
    assert.equal(result.operationsUpdated, 1);
    assert.equal(result.operationsFailed, 0);
    assert.equal(result.batches, 1);
  });

  it("case 4: already COMPLETED is not updated", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const completed = makeOperation({ status: "COMPLETED" });
    let promotions = 0;
    mock.method(operationRepository, "promoteLifecycleStatus", async () => {
      promotions += 1;
      return completed;
    });

    const result = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      completed,
      new Date("2026-08-16T00:00:00.000Z"),
    );
    assert.equal(result.status, "COMPLETED");
    assert.equal(promotions, 0);
  });

  it("case 5: CANCELLED stays CANCELLED", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const cancelled = makeOperation({ status: "CANCELLED" });
    let promotions = 0;
    mock.method(operationRepository, "promoteLifecycleStatus", async () => {
      promotions += 1;
      return cancelled;
    });

    const result = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      cancelled,
      new Date("2026-08-16T00:00:00.000Z"),
    );
    assert.equal(result.status, "CANCELLED");
    assert.equal(promotions, 0);
  });

  it("case 6: RECURRING is not auto-completed", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const recurring = makeOperation({
      operationKind: "RECURRING",
      scheduledStart: null,
      scheduledEnd: null,
    });
    let promotions = 0;
    mock.method(operationRepository, "promoteLifecycleStatus", async () => {
      promotions += 1;
      return recurring;
    });

    const result = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      recurring,
      new Date("2026-08-16T00:00:00.000Z"),
    );
    assert.equal(result.status, "SCHEDULED");
    assert.equal(promotions, 0);
  });

  it("case 7: concurrent promote converges to COMPLETED after CAS miss + reread", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const operation = makeOperation();
    let promotions = 0;
    mock.method(operationRepository, "promoteLifecycleStatus", async () => {
      promotions += 1;
      if (promotions === 1) {
        return { ...operation, status: "COMPLETED" as const };
      }
      return null;
    });
    mock.method(operationRepository, "findById", async () => ({
      ...operation,
      status: "COMPLETED" as const,
    }));

    const now = new Date("2026-08-16T00:00:00.000Z");
    const [first, second] = await Promise.all([
      operationLifecycleService.syncPersistedStatus(COMPANY_ID, operation, now),
      operationLifecycleService.syncPersistedStatus(COMPANY_ID, operation, now),
    ]);

    assert.equal(promotions, 2);
    assert.equal(first.status, "COMPLETED");
    assert.equal(second.status, "COMPLETED");
  });

  it("read-path CAS miss re-reads persisted status without a second write", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const operation = makeOperation();
    let promotions = 0;
    let rereads = 0;
    mock.method(operationRepository, "promoteLifecycleStatus", async () => {
      promotions += 1;
      return null;
    });
    mock.method(operationRepository, "findById", async () => {
      rereads += 1;
      return { ...operation, status: "COMPLETED" as const };
    });

    const result = await operationLifecycleService.syncPersistedStatus(
      COMPANY_ID,
      operation,
      new Date("2026-08-16T00:00:00.000Z"),
    );

    assert.equal(result.status, "COMPLETED");
    assert.equal(promotions, 1);
    assert.equal(rereads, 1);
  });

  it("case 8: a failed row does not block the rest of the batch", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const a = makeOperation({ id: paddedId(1) });
    const b = makeOperation({ id: paddedId(2) });
    const c = makeOperation({ id: paddedId(3) });
    mock.method(operationRepository, "listOneTimeLifecycleDue", async () => [
      dueRow(a),
      dueRow(b),
      dueRow(c),
    ]);
    mock.method(operationRepository, "promoteLifecycleStatus", async (_c, id) => {
      if (id === b.id) {
        throw new Error("row locked");
      }
      return { ...a, id, status: "COMPLETED" as const };
    });
    mock.method(operationRepository, "countOneTimeLifecycleDue", async () => 0);

    const result = await operationLifecycleService.reconcileDue({
      now: new Date("2026-08-16T00:00:00.000Z"),
      batchSize: 10,
      maxBatches: 1,
    });
    assert.equal(result.operationsUpdated, 2);
    assert.equal(result.operationsFailed, 1);
  });

  it("case 9: backlog larger than batch is drained across ticks of the same run", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const all = Array.from({ length: 6 }, (_, index) =>
      makeOperation({ id: paddedId(index) }),
    );
    let remaining = [...all];
    mock.method(operationRepository, "listOneTimeLifecycleDue", async ({ limit, afterId }) => {
      const start = afterId ? remaining.findIndex((row) => row.id === afterId) + 1 : 0;
      const sliceStart = start < 0 ? 0 : start;
      return remaining.slice(sliceStart, sliceStart + limit).map((operation) => dueRow(operation));
    });
    mock.method(operationRepository, "promoteLifecycleStatus", async (_c, id, _from, to) => {
      const found = remaining.find((row) => row.id === id);
      remaining = remaining.filter((row) => row.id !== id);
      return found ? { ...found, status: to } : null;
    });
    mock.method(operationRepository, "countOneTimeLifecycleDue", async () => remaining.length);

    const result = await operationLifecycleService.reconcileDue({
      now: new Date("2026-08-16T00:00:00.000Z"),
      batchSize: 2,
      maxBatches: 10,
    });
    assert.equal(result.operationsUpdated, 6);
    assert.equal(result.batches, 3);
    assert.equal(remaining.length, 0);
  });

  it("more than 500 poison rows do not starve later processable operations", async () => {
    await prepareLifecycleTest();
    const { operationLifecycleService } = await import("./operation-lifecycle.service");
    const poisons = Array.from({ length: 520 }, (_, index) =>
      makeOperation({
        id: paddedId(index),
        scheduledEnd: `2026-08-01T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
      }),
    );
    const processable = [
      makeOperation({ id: paddedId(9001), scheduledEnd: "2026-08-02T00:00:00.000Z" }),
      makeOperation({ id: paddedId(9002), scheduledEnd: "2026-08-02T01:00:00.000Z" }),
    ];
    const ordered = [...poisons, ...processable];
    const poisonIds = new Set(poisons.map((row) => row.id));

    mock.method(operationRepository, "listOneTimeLifecycleDue", async ({ limit, afterId }) => {
      const start = afterId ? ordered.findIndex((row) => row.id === afterId) + 1 : 0;
      const sliceStart = start < 0 ? ordered.length : start;
      return ordered.slice(sliceStart, sliceStart + limit).map((operation) => dueRow(operation));
    });
    mock.method(operationRepository, "promoteLifecycleStatus", async (_c, id, _from, to) => {
      if (poisonIds.has(id)) {
        throw new Error("poison");
      }
      const found = processable.find((row) => row.id === id);
      return found ? { ...found, status: to } : null;
    });
    mock.method(operationRepository, "countOneTimeLifecycleDue", async () => 520);

    const result = await operationLifecycleService.reconcileDue({
      now: new Date("2026-08-16T00:00:00.000Z"),
      batchSize: 50,
      maxBatches: 20,
    });

    assert.ok(result.operationsFailed > 500);
    assert.equal(result.operationsUpdated, 2);
    assert.equal(result.operationsFailed, 520);
  });
});
