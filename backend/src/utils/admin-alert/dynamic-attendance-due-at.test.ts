import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeConfirmationMissingDueAt,
  computeMissingCheckinAfterStartDueAt,
  computeMissingCheckoutAfterEndDueAt,
  isDueWithinMaxLateness,
  minutesBetween,
} from "./dynamic-attendance-due-at";

describe("dynamic-attendance-due-at", () => {
  it("computes confirmation due before start", () => {
    const start = new Date("2026-09-11T23:30:00.000Z"); // 20:30 AR
    const due = computeConfirmationMissingDueAt(start, 60);
    assert.equal(due.toISOString(), "2026-09-11T22:30:00.000Z");
  });

  it("computes missing check-in after start + late tolerance", () => {
    const start = new Date("2026-09-11T23:30:00.000Z");
    const due = computeMissingCheckinAfterStartDueAt(start, 30);
    assert.equal(due.toISOString(), "2026-09-12T00:00:00.000Z");
  });

  it("computes missing checkout after overnight end + delay", () => {
    const end = new Date("2026-09-12T06:00:00.000Z"); // 03:00 AR
    const due = computeMissingCheckoutAfterEndDueAt(end, 30);
    assert.equal(due.toISOString(), "2026-09-12T06:30:00.000Z");
  });

  it("accepts dueAt inside max lateness window", () => {
    const dueAt = new Date("2026-09-12T00:00:00.000Z");
    const now = new Date("2026-09-12T00:30:00.000Z");
    assert.equal(isDueWithinMaxLateness(dueAt, now, 60), true);
  });

  it("rejects dueAt older than max lateness", () => {
    const dueAt = new Date("2026-09-12T00:00:00.000Z");
    const now = new Date("2026-09-12T01:30:00.000Z");
    assert.equal(isDueWithinMaxLateness(dueAt, now, 60), false);
  });

  it("rejects dueAt still in the future", () => {
    const dueAt = new Date("2026-09-12T01:00:00.000Z");
    const now = new Date("2026-09-12T00:30:00.000Z");
    assert.equal(isDueWithinMaxLateness(dueAt, now, 60), false);
  });

  it("rejects dueAt before admin alerts watermark", () => {
    const dueAt = new Date("2026-09-12T00:00:00.000Z");
    const now = new Date("2026-09-12T00:30:00.000Z");
    const watermark = new Date("2026-09-12T00:10:00.000Z");
    assert.equal(isDueWithinMaxLateness(dueAt, now, 60, watermark), false);
  });

  it("minutesBetween floors positive deltas", () => {
    assert.equal(
      minutesBetween(
        new Date("2026-09-12T00:00:00.000Z"),
        new Date("2026-09-12T00:45:30.000Z"),
      ),
      45,
    );
  });
});
