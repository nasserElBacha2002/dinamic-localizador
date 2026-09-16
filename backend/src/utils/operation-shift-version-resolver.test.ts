import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  OperationShiftDateException,
  OperationShiftVersion,
} from "../types/operation-shift";
import { dateRangesOverlap } from "./shift-time";
import {
  isDayEnabled,
  resolveShiftScheduleForDate,
  resolveVersionForDate,
} from "./operation-shift-version-resolver";

const TZ = "America/Argentina/Buenos_Aires";

const version = (
  overrides: Partial<OperationShiftVersion> &
    Pick<OperationShiftVersion, "effectiveFrom" | "startTime" | "endTime">,
): OperationShiftVersion => ({
  id: overrides.id ?? "ver-1",
  companyId: "co-1",
  operationShiftId: "shift-1",
  effectiveFrom: overrides.effectiveFrom,
  effectiveUntil: overrides.effectiveUntil ?? null,
  startTime: overrides.startTime,
  endTime: overrides.endTime,
  days: overrides.days ?? [
    { dayOfWeek: 1, isEnabled: true },
    { dayOfWeek: 2, isEnabled: true },
    { dayOfWeek: 3, isEnabled: true },
    { dayOfWeek: 4, isEnabled: true },
    { dayOfWeek: 5, isEnabled: true },
    { dayOfWeek: 6, isEnabled: false },
    { dayOfWeek: 7, isEnabled: false },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const exception = (
  overrides: Partial<OperationShiftDateException> &
    Pick<OperationShiftDateException, "exceptionKind">,
): OperationShiftDateException => ({
  id: "ex-1",
  companyId: "co-1",
  operationId: "op-1",
  operationShiftId: "shift-1",
  workDate: overrides.workDate ?? "2026-09-15",
  exceptionKind: overrides.exceptionKind,
  startTime: overrides.startTime ?? null,
  endTime: overrides.endTime ?? null,
  reason: overrides.reason ?? null,
  createdByUserId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("operation-shift-version-resolver", () => {
  it("resolveVersionForDate picks the covering version", () => {
    const versions = [
      version({
        id: "a",
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2026-06-30",
        startTime: "06:00",
        endTime: "14:00",
      }),
      version({
        id: "b",
        effectiveFrom: "2026-07-01",
        effectiveUntil: null,
        startTime: "07:00",
        endTime: "15:00",
      }),
    ];

    assert.equal(resolveVersionForDate(versions, "2026-03-15")?.id, "a");
    assert.equal(resolveVersionForDate(versions, "2026-07-01")?.id, "b");
    assert.equal(resolveVersionForDate(versions, "2026-12-31")?.id, "b");
    assert.equal(resolveVersionForDate(versions, "2025-12-31"), null);
  });

  it("dateRangesOverlap detects version effective collisions", () => {
    assert.equal(dateRangesOverlap("2026-01-01", null, "2026-06-01", "2026-07-01"), true);
    assert.equal(dateRangesOverlap("2026-01-01", "2026-01-31", "2026-02-01", null), false);
    assert.equal(dateRangesOverlap("2026-01-01", "2026-01-31", "2026-01-31", "2026-02-01"), true);
  });

  it("isDayEnabled uses Luxon ISO weekday in timezone", () => {
    // 2026-09-15 is a Tuesday (ISO 2) in America/Argentina/Buenos_Aires
    const v = version({
      effectiveFrom: "2026-01-01",
      startTime: "06:00",
      endTime: "14:00",
      days: [
        { dayOfWeek: 1, isEnabled: false },
        { dayOfWeek: 2, isEnabled: true },
        { dayOfWeek: 3, isEnabled: false },
        { dayOfWeek: 4, isEnabled: false },
        { dayOfWeek: 5, isEnabled: false },
        { dayOfWeek: 6, isEnabled: false },
        { dayOfWeek: 7, isEnabled: false },
      ],
    });
    assert.equal(isDayEnabled(v, "2026-09-15", TZ), true);
    // 2026-09-19 is Saturday (ISO 6)
    assert.equal(isDayEnabled(v, "2026-09-19", TZ), false);
  });

  it("resolveShiftScheduleForDate applies CANCEL > TIME_OVERRIDE > version", () => {
    const v = version({
      effectiveFrom: "2026-01-01",
      startTime: "06:00",
      endTime: "14:00",
    });

    const fromVersion = resolveShiftScheduleForDate({
      version: v,
      exception: null,
      workDate: "2026-09-15",
      timezone: TZ,
    });
    assert.equal(fromVersion.cancelled, false);
    assert.equal(fromVersion.startTime, "06:00");
    assert.equal(fromVersion.endTime, "14:00");
    assert.ok(fromVersion.expectedStartAt instanceof Date);
    assert.ok(fromVersion.expectedEndAt instanceof Date);

    const overridden = resolveShiftScheduleForDate({
      version: v,
      exception: exception({
        exceptionKind: "TIME_OVERRIDE",
        startTime: "08:00",
        endTime: "16:00",
      }),
      workDate: "2026-09-15",
      timezone: TZ,
    });
    assert.equal(overridden.cancelled, false);
    assert.equal(overridden.startTime, "08:00");
    assert.equal(overridden.endTime, "16:00");

    const cancelled = resolveShiftScheduleForDate({
      version: v,
      exception: exception({ exceptionKind: "CANCEL" }),
      workDate: "2026-09-15",
      timezone: TZ,
    });
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.startTime, "06:00");
    assert.equal(cancelled.endTime, "14:00");

    const restored = resolveShiftScheduleForDate({
      version: v,
      exception: exception({ exceptionKind: "RESTORE" }),
      workDate: "2026-09-15",
      timezone: TZ,
    });
    assert.equal(restored.cancelled, false);
    assert.equal(restored.startTime, "06:00");
  });
});
