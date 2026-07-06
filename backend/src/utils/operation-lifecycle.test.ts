import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInventoryEffectiveEnd,
  isInventoryStartInPast,
  resolveLifecycleOperationStatus,
} from "./operation-lifecycle";

describe("inventory lifecycle", () => {
  const baseOperation = {
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
    const end = getInventoryEffectiveEnd(
      "2026-06-22T14:29:00.000Z",
      null,
      90,
    );
    assert.equal(end.toISOString(), "2026-06-22T15:59:00.000Z");
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
      isInventoryStartInPast("2020-01-01T10:00:00.000Z", new Date("2026-01-01T10:00:00.000Z")),
      true,
    );
    assert.equal(
      isInventoryStartInPast("2026-12-01T10:00:00.000Z", new Date("2026-01-01T10:00:00.000Z")),
      false,
    );
  });
});
