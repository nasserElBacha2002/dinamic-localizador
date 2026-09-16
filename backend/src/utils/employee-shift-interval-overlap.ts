import { DateTime } from "luxon";
import { buildRecurringExpectedInstants } from "./recurring-workday-instant";
import { isOvernightShift, normalizeShiftTime } from "./shift-time";

export type ShiftIntervalInput = {
  operationId: string;
  operationShiftId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type CrossOperationShiftOverlapWarning = {
  code: "CROSS_OPERATION_SHIFT_OVERLAP";
  left: ShiftIntervalInput;
  right: ShiftIntervalInput;
  leftStartAt: string;
  leftEndAt: string;
  rightStartAt: string;
  rightEndAt: string;
};

export type EmployeeShiftIntervalOverlapResult =
  | { overlaps: false }
  | { overlaps: true; sameOperation: true }
  | { overlaps: true; sameOperation: false; warning: CrossOperationShiftOverlapWarning };

const toInterval = (input: ShiftIntervalInput): { startAt: Date; endAt: Date } => {
  const startTime = normalizeShiftTime(input.startTime);
  const endTime = normalizeShiftTime(input.endTime);
  // Overnight: buildRecurringExpectedInstants already rolls end to next calendar day.
  void isOvernightShift(startTime, endTime);
  const { expectedStartAt, expectedEndAt } = buildRecurringExpectedInstants({
    workDate: input.workDate,
    startTime,
    endTime,
    timezone: input.timezone,
  });
  return { startAt: expectedStartAt, endAt: expectedEndAt };
};

const intervalsOverlap = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

/**
 * Real datetime interval overlap (overnight-aware via workDate + HH:mm + timezone).
 * - Same operation: overlaps = true, sameOperation = true (caller should block).
 * - Different operations: overlaps = true with warning structure (non-blocking).
 */
export const employeeShiftIntervalOverlap = (
  left: ShiftIntervalInput,
  right: ShiftIntervalInput,
): EmployeeShiftIntervalOverlapResult => {
  const leftInterval = toInterval(left);
  const rightInterval = toInterval(right);

  if (
    !intervalsOverlap(
      leftInterval.startAt,
      leftInterval.endAt,
      rightInterval.startAt,
      rightInterval.endAt,
    )
  ) {
    return { overlaps: false };
  }

  if (left.operationId === right.operationId) {
    return { overlaps: true, sameOperation: true };
  }

  return {
    overlaps: true,
    sameOperation: false,
    warning: {
      code: "CROSS_OPERATION_SHIFT_OVERLAP",
      left,
      right,
      leftStartAt: leftInterval.startAt.toISOString(),
      leftEndAt: leftInterval.endAt.toISOString(),
      rightStartAt: rightInterval.startAt.toISOString(),
      rightEndAt: rightInterval.endAt.toISOString(),
    },
  };
};

/** Convenience: half-open local day bounds for debugging / tests. */
export const localWorkDateBoundsIso = (workDate: string, timezone: string): {
  dayStart: string;
  dayEnd: string;
} => {
  const start = DateTime.fromISO(workDate, { zone: timezone }).startOf("day");
  return {
    dayStart: start.toUTC().toISO()!,
    dayEnd: start.plus({ days: 1 }).toUTC().toISO()!,
  };
};
