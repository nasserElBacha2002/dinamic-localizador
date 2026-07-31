import type { Operation } from "../types/domain";
import type { UpdateOperationInput } from "../schemas/operation.schema";

export type OneTimeScheduleChangeFlags = {
  timingChanged: boolean;
  toleranceChanged: boolean;
  scheduleAffecting: boolean;
};

const toEpochMs = (value: string | null | undefined): number | null => {
  if (value == null) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Detects ONE_TIME fields that affect materialization / reminders / check-in.
 * Notes/status/service-only edits are not schedule-affecting.
 */
export const detectOneTimeScheduleAffectingChanges = (
  current: Pick<
    Operation,
    "scheduledStart" | "scheduledEnd" | "earlyToleranceMinutes" | "lateToleranceMinutes"
  >,
  input: Pick<
    UpdateOperationInput,
    "scheduledStart" | "scheduledEnd" | "earlyToleranceMinutes" | "lateToleranceMinutes"
  >,
): OneTimeScheduleChangeFlags => {
  const timingChanged =
    (input.scheduledStart !== undefined &&
      toEpochMs(input.scheduledStart) !== toEpochMs(current.scheduledStart)) ||
    (input.scheduledEnd !== undefined &&
      toEpochMs(input.scheduledEnd) !== toEpochMs(current.scheduledEnd));

  const toleranceChanged =
    (input.earlyToleranceMinutes !== undefined &&
      input.earlyToleranceMinutes !== current.earlyToleranceMinutes) ||
    (input.lateToleranceMinutes !== undefined &&
      input.lateToleranceMinutes !== current.lateToleranceMinutes);

  return {
    timingChanged,
    toleranceChanged,
    scheduleAffecting: timingChanged || toleranceChanged,
  };
};
