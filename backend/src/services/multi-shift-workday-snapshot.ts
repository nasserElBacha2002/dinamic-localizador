import type { OperationShift, OperationShiftVersion } from "../types/operation-shift";
import type { ResolvedShiftScheduleForDate } from "../utils/operation-shift-version-resolver";

export type MultiShiftWorkdaySnapshot = {
  workDate: string;
  operationShiftId: string;
  operationShiftVersionId: string;
  shiftCodeSnapshot: string;
  shiftNameSnapshot: string;
  expectedStartAt: Date;
  expectedEndAt: Date;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  scheduleVersion: number;
  scheduleSourceSnapshot: "CUSTOM";
  scheduleTimezoneSnapshot: string;
  status: "ACTIVE";
};

export const buildMultiShiftWorkdaySnapshot = (input: {
  workDate: string;
  shift: Pick<OperationShift, "id" | "code" | "name">;
  version: Pick<OperationShiftVersion, "id">;
  schedule: Pick<ResolvedShiftScheduleForDate, "expectedStartAt" | "expectedEndAt">;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  timezone: string;
  scheduleVersion?: number;
}): MultiShiftWorkdaySnapshot => ({
  workDate: input.workDate,
  operationShiftId: input.shift.id,
  operationShiftVersionId: input.version.id,
  shiftCodeSnapshot: input.shift.code,
  shiftNameSnapshot: input.shift.name,
  expectedStartAt: input.schedule.expectedStartAt,
  expectedEndAt: input.schedule.expectedEndAt,
  earlyToleranceMinutes: input.earlyToleranceMinutes,
  lateToleranceMinutes: input.lateToleranceMinutes,
  scheduleVersion: input.scheduleVersion ?? 1,
  scheduleSourceSnapshot: "CUSTOM",
  scheduleTimezoneSnapshot: input.timezone,
  status: "ACTIVE",
});

export const workdayShiftKey = (workDate: string, operationShiftId: string): string =>
  `${workDate}::${operationShiftId}`;
