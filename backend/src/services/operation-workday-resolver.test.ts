import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Operation } from "../types/domain";
import { operationWorkdayResolver } from "./operation-workday-resolver";

const timezone = "America/Argentina/Buenos_Aires";

const baseOperation = (overrides: Partial<Operation> = {}): Operation => ({
  id: "operation-1",
  serviceId: "service-1",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-07-06T12:00:00.000Z",
  scheduledEnd: "2026-07-06T21:00:00.000Z",
  earlyToleranceMinutes: 30,
  lateToleranceMinutes: 45,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("operationWorkdayResolver.resolveOneTime", () => {
  it("resolves work date from local operation start", () => {
    const resolved = operationWorkdayResolver.resolveOneTime(
      baseOperation({
        scheduledStart: "2026-07-07T01:00:00.000Z",
        scheduledEnd: "2026-07-07T09:00:00.000Z",
      }),
      timezone,
    );

    assert.equal(resolved.workDate, "2026-07-06");
    assert.equal(resolved.expectedStartAt.toISOString(), "2026-07-07T01:00:00.000Z");
    assert.equal(resolved.expectedEndAt?.toISOString(), "2026-07-07T09:00:00.000Z");
    assert.equal(resolved.timezone, timezone);
    assert.equal(resolved.scheduleVersion, 1);
  });

  it("builds check-in window from snapshotted tolerances", () => {
    const resolved = operationWorkdayResolver.resolveOneTime(
      baseOperation({
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 30,
      }),
      timezone,
    );

    assert.equal(
      resolved.checkInWindowStartAt.toISOString(),
      new Date(resolved.expectedStartAt.getTime() - 15 * 60_000).toISOString(),
    );
    assert.equal(
      resolved.checkInWindowEndAt.toISOString(),
      new Date(resolved.expectedStartAt.getTime() + 30 * 60_000).toISOString(),
    );
  });

  it("rejects recurring operations", () => {
    assert.throws(
      () =>
        operationWorkdayResolver.resolveOneTime(
          baseOperation({ operationKind: "RECURRING" }),
          timezone,
        ),
      (error: unknown) =>
        error instanceof Error && error.message.includes("recurrentes aún no están disponibles"),
    );
  });
});
