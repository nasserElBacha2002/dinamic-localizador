import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBotWorkdaySelectionLines, formatWorkdayScheduleLine } from "../utils/employee-assignment-format";
import {
  resolveMultiShiftOneTimeLifecycleStatus,
  hasActiveFutureOrInProgressWorkday,
} from "../utils/multi-shift-lifecycle";
import { isWorkdayCoveredByAbsence } from "../utils/resolve-effective-absence-for-workday";
import type { OperationWorkday } from "../types/workday";

const TIMEZONE = "America/Argentina/Buenos_Aires";

describe("phase3 multi-shift attendance helpers", () => {
  it("formats shift labels and overnight schedule lines", () => {
    const overnight = formatWorkdayScheduleLine(
      {
        expectedStartAt: "2026-09-16T01:00:00.000Z", // 22:00 ART on work_date 15/09
        expectedEndAt: "2026-09-16T09:00:00.000Z", // 06:00 ART next local day
        workDate: "2026-09-15",
        scheduleTimezone: TIMEZONE,
      },
      TIMEZONE,
    );
    assert.match(overnight, /del día siguiente/);

    const lines = formatBotWorkdaySelectionLines(
      1,
      {
        serviceName: "Limpieza Shopping",
        serviceAddress: null,
        serviceLocality: null,
        expectedStartAt: "2026-09-15T09:00:00.000Z",
        expectedEndAt: "2026-09-15T17:00:00.000Z",
        workDate: "2026-09-15",
        shiftNameSnapshot: "Mañana",
        scheduleTimezone: TIMEZONE,
      },
      TIMEZONE,
    );
    assert.match(lines[0]!, /1\. Mañana —/);
    assert.match(lines[0]!, /Limpieza Shopping/);
  });

  it("partial AM absence overlaps morning but not afternoon shift", () => {
    const absence = {
      id: "a1",
      employeeId: "e1",
      startDate: "2026-09-15",
      endDate: "2026-09-15",
      startPeriod: "AM" as const,
      endPeriod: "AM" as const,
      reviewedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    const morning = {
      workDate: "2026-09-15",
      expectedStartAt: "2026-09-15T09:00:00.000Z", // 06:00 ART
      expectedEndAt: "2026-09-15T17:00:00.000Z", // 14:00 ART
      scheduleTimezone: TIMEZONE,
    };
    const afternoon = {
      workDate: "2026-09-15",
      expectedStartAt: "2026-09-15T18:00:00.000Z", // 15:00 ART
      expectedEndAt: "2026-09-16T01:00:00.000Z", // 22:00 ART
      scheduleTimezone: TIMEZONE,
    };
    assert.equal(isWorkdayCoveredByAbsence(morning, absence), true);
    assert.equal(isWorkdayCoveredByAbsence(afternoon, absence), false);
  });

  it("lifecycle: morning complete does not complete operation while afternoon open", () => {
    const at = new Date("2026-09-15T18:00:00.000Z");
    const workdays = [
      {
        id: "w1",
        status: "ACTIVE",
        expectedStartAt: "2026-09-15T09:00:00.000Z",
        expectedEndAt: "2026-09-15T17:00:00.000Z",
      },
      {
        id: "w2",
        status: "ACTIVE",
        expectedStartAt: "2026-09-15T17:00:00.000Z",
        expectedEndAt: "2026-09-16T01:00:00.000Z",
      },
    ] as OperationWorkday[];

    assert.equal(hasActiveFutureOrInProgressWorkday(workdays, at), true);
    assert.equal(resolveMultiShiftOneTimeLifecycleStatus(workdays, at, "COMPLETED"), "IN_PROGRESS");
  });

  it("lifecycle: all active workdays ended → COMPLETED", () => {
    const at = new Date("2026-09-16T12:00:00.000Z");
    const workdays = [
      {
        id: "w1",
        status: "ACTIVE",
        expectedStartAt: "2026-09-15T09:00:00.000Z",
        expectedEndAt: "2026-09-15T17:00:00.000Z",
      },
      {
        id: "w2",
        status: "CANCELLED",
        expectedStartAt: "2026-09-15T17:00:00.000Z",
        expectedEndAt: "2026-09-16T01:00:00.000Z",
      },
    ] as OperationWorkday[];
    assert.equal(resolveMultiShiftOneTimeLifecycleStatus(workdays, at, "IN_PROGRESS"), "COMPLETED");
  });
});
