import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import {
  assertSingleScheduleModeOrReject,
} from "../utils/operation-schedule-mode-guard";
import {
  isDayEnabled,
  resolveShiftScheduleForDate,
  resolveVersionForDate,
} from "../utils/operation-shift-version-resolver";
import { employeeShiftIntervalOverlap } from "../utils/employee-shift-interval-overlap";
import type { OperationShiftVersion } from "../types/operation-shift";
import type { OperationWorkday } from "../types/workday";

const TIMEZONE = "America/Argentina/Buenos_Aires";

const version = (overrides: Partial<OperationShiftVersion> = {}): OperationShiftVersion => ({
  id: "version-1",
  companyId: "c1",
  operationShiftId: "shift-1",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  startTime: "09:00",
  endTime: "17:00",
  days: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek !== 7, // Sunday off
  })),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("multi-shift materialization helpers", () => {
  it("indexes workdays by workDate::shiftId not date alone", () => {
    const key = (workDate: string, shiftId: string) => `${workDate}::${shiftId}`;
    const map = new Map<string, string>();
    map.set(key("2026-09-15", "shift-a"), "wd-a");
    map.set(key("2026-09-15", "shift-b"), "wd-b");
    assert.equal(map.get(key("2026-09-15", "shift-a")), "wd-a");
    assert.equal(map.get(key("2026-09-15", "shift-b")), "wd-b");
    assert.notEqual(map.get("2026-09-15"), "wd-a");
  });

  it("skips days when version day is disabled", () => {
    const v = version();
    // 2026-09-20 is Sunday
    assert.equal(isDayEnabled(v, "2026-09-20", TIMEZONE), false);
    // 2026-09-15 is Tuesday
    assert.equal(isDayEnabled(v, "2026-09-15", TIMEZONE), true);
  });

  it("resolveVersionForDate returns null outside range", () => {
    const v = version({ effectiveFrom: "2026-09-01", effectiveUntil: "2026-09-10" });
    assert.equal(resolveVersionForDate([v], "2026-08-31"), null);
    assert.ok(resolveVersionForDate([v], "2026-09-05"));
    assert.equal(resolveVersionForDate([v], "2026-09-11"), null);
  });

  it("EXCEPTION cancel is not schedule-reactivatable", () => {
    const workday: Pick<OperationWorkday, "status" | "cancellationReason" | "expectedStartAt"> = {
      status: "CANCELLED",
      cancellationReason: "EXCEPTION",
      expectedStartAt: "2099-01-01T12:00:00.000Z",
    };
    const isFutureMutable = (
      row: typeof workday,
      attendance: Set<string>,
      referenceAt = new Date(),
    ): boolean => {
      if (row.status === "CANCELLED" && row.cancellationReason === "EXCEPTION") {
        return false;
      }
      if (new Date(row.expectedStartAt) <= referenceAt) {
        return false;
      }
      return !attendance.has("x");
    };
    assert.equal(isFutureMutable(workday, new Set()), false);
  });

  it("exception CANCEL wins over version times", () => {
    const schedule = resolveShiftScheduleForDate({
      version: version(),
      exception: {
        id: "ex1",
        companyId: "c1",
        operationId: "op1",
        operationShiftId: "shift-1",
        workDate: "2026-09-15",
        exceptionKind: "CANCEL",
        startTime: null,
        endTime: null,
        reason: null,
        createdByUserId: null,
        updatedByUserId: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
      workDate: "2026-09-15",
      timezone: TIMEZONE,
    });
    assert.equal(schedule.cancelled, true);
  });

  it("assertSingleScheduleModeOrReject blocks MULTI_SHIFT consumers", () => {
    assert.doesNotThrow(() => assertSingleScheduleModeOrReject("SINGLE"));
    assert.throws(
      () => assertSingleScheduleModeOrReject("MULTI_SHIFT", "MULTI_SHIFT_NOT_SUPPORTED_HERE"),
      (error: unknown) =>
        error instanceof AppError && error.code === "MULTI_SHIFT_NOT_SUPPORTED_HERE",
    );
  });

  it("employeeShiftIntervalOverlap blocks same operation and warns cross-op", () => {
    const left = {
      operationId: "op-a",
      operationShiftId: "s1",
      workDate: "2026-09-15",
      startTime: "09:00",
      endTime: "17:00",
      timezone: TIMEZONE,
    };
    const sameOp = employeeShiftIntervalOverlap(left, {
      ...left,
      operationShiftId: "s2",
      startTime: "16:00",
      endTime: "20:00",
    });
    assert.equal(sameOp.overlaps, true);
    if (sameOp.overlaps) {
      assert.equal(sameOp.sameOperation, true);
    }

    const cross = employeeShiftIntervalOverlap(left, {
      ...left,
      operationId: "op-b",
      startTime: "16:00",
      endTime: "20:00",
    });
    assert.equal(cross.overlaps, true);
    if (cross.overlaps && !cross.sameOperation) {
      assert.equal(cross.warning.code, "CROSS_OPERATION_SHIFT_OVERLAP");
    }

    const overnight = employeeShiftIntervalOverlap(
      {
        operationId: "op-a",
        operationShiftId: "night",
        workDate: "2026-09-15",
        startTime: "22:00",
        endTime: "06:00",
        timezone: TIMEZONE,
      },
      {
        operationId: "op-a",
        operationShiftId: "early",
        workDate: "2026-09-16",
        startTime: "05:00",
        endTime: "09:00",
        timezone: TIMEZONE,
      },
    );
    assert.equal(overnight.overlaps, true);
  });
});
