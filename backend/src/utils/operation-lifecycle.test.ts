import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOperationEffectiveEnd,
  isOperationStartInPast,
  resolveLifecycleOperationStatus,
} from "./operation-lifecycle";

describe("operation lifecycle", () => {
  const baseOperation = {
    operationKind: "ONE_TIME" as const,
    status: "SCHEDULED" as const,
    scheduledStart: "2026-06-22T14:29:00.000Z",
    scheduledEnd: "2026-06-23T01:29:00.000Z",
    earlyToleranceMinutes: 60,
    lateToleranceMinutes: 90,
  };

  it("resolves SCHEDULED before start", () => {
    assert.equal(
      resolveLifecycleOperationStatus(baseOperation, new Date("2026-06-22T14:00:00.000Z")),
      "SCHEDULED",
    );
  });

  it("resolves IN_PROGRESS after start and before end", () => {
    assert.equal(
      resolveLifecycleOperationStatus(baseOperation, new Date("2026-06-22T15:00:00.000Z")),
      "IN_PROGRESS",
    );
  });

  it("resolves COMPLETED after scheduled end", () => {
    assert.equal(
      resolveLifecycleOperationStatus(baseOperation, new Date("2026-06-23T02:00:00.000Z")),
      "COMPLETED",
    );
  });

  it("uses late tolerance as effective end when scheduled end is missing", () => {
    const end = getOperationEffectiveEnd(
      "2026-06-22T14:29:00.000Z",
      null,
      90,
    );
    assert.equal(end.toISOString(), "2026-06-22T15:59:00.000Z");
  });

  it("does not add late tolerance when scheduledEnd is present (attendance-only window)", () => {
    const end = getOperationEffectiveEnd(
      "2026-08-13T23:50:00.000Z",
      "2026-08-14T06:00:00.000Z",
      30,
    );
    assert.equal(end?.toISOString(), "2026-08-14T06:00:00.000Z");
    assert.equal(
      resolveLifecycleOperationStatus(
        { ...baseOperation, operationKind: "ONE_TIME", lateToleranceMinutes: 30 },
        new Date("2026-08-14T06:00:00.000Z"),
      ),
      "COMPLETED",
    );
  });

  it("resolves COMPLETED from SCHEDULED when the clock skipped the in-progress window", () => {
    assert.equal(
      resolveLifecycleOperationStatus(
        { ...baseOperation, operationKind: "ONE_TIME", status: "SCHEDULED" },
        new Date("2026-06-25T00:00:00.000Z"),
      ),
      "COMPLETED",
    );
  });

  it("does not auto-complete RECURRING operations", () => {
    assert.equal(
      resolveLifecycleOperationStatus(
        {
          ...baseOperation,
          operationKind: "RECURRING",
          scheduledStart: null,
          scheduledEnd: null,
          status: "SCHEDULED",
        },
        new Date("2026-06-25T00:00:00.000Z"),
      ),
      "SCHEDULED",
    );
  });

  it("keeps terminal statuses unchanged", () => {
    assert.equal(
      resolveLifecycleOperationStatus(
        { ...baseOperation, status: "CANCELLED" },
        new Date("2026-06-23T02:00:00.000Z"),
      ),
      "CANCELLED",
    );
  });

  it("detects past start dates", () => {
    assert.equal(
      isOperationStartInPast("2020-01-01T10:00:00.000Z", new Date("2026-01-01T10:00:00.000Z")),
      true,
    );
    assert.equal(
      isOperationStartInPast("2026-12-01T10:00:00.000Z", new Date("2026-01-01T10:00:00.000Z")),
      false,
    );
  });
});
