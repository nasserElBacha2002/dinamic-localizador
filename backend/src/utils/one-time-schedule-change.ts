import type { Operation } from "../types/domain";
import type { UpdateOperationInput } from "../schemas/operation.schema";

/**
 * Explicit impact classification for ONE_TIME schedule edits.
 *
 * Version policy (documented):
 * - operation_workdays.schedule_version is the **reminder schedule generation**.
 *   It bumps only when reminderScheduleChanged (timing: start/end).
 * - Confirmation uses operation_assignments.confirmation_schedule_version,
 *   bumped only when confirmationScheduleChanged (timing).
 * - Tolerance-only updates refresh the workday snapshot fields without bumping
 *   reminder/confirmation versions, so SENT reminders are not re-opened.
 */
export type OneTimeScheduleChangeImpact = {
  timingChanged: boolean;
  toleranceChanged: boolean;
  workdaySnapshotChanged: boolean;
  confirmationScheduleChanged: boolean;
  reminderScheduleChanged: boolean;
  /** Any change that requires transactional reconciliation of derived entities. */
  scheduleAffecting: boolean;
};

/** @deprecated Prefer OneTimeScheduleChangeImpact; kept for call-site compatibility. */
export type OneTimeScheduleChangeFlags = OneTimeScheduleChangeImpact;

const toEpochMs = (value: string | null | undefined): number | null => {
  if (value == null) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const detectOneTimeScheduleAffectingChanges = (
  current: Pick<
    Operation,
    "scheduledStart" | "scheduledEnd" | "earlyToleranceMinutes" | "lateToleranceMinutes"
  >,
  input: Pick<
    UpdateOperationInput,
    "scheduledStart" | "scheduledEnd" | "earlyToleranceMinutes" | "lateToleranceMinutes"
  >,
): OneTimeScheduleChangeImpact => {
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

  const workdaySnapshotChanged = timingChanged || toleranceChanged;
  const confirmationScheduleChanged = timingChanged;
  const reminderScheduleChanged = timingChanged;

  return {
    timingChanged,
    toleranceChanged,
    workdaySnapshotChanged,
    confirmationScheduleChanged,
    reminderScheduleChanged,
    scheduleAffecting: workdaySnapshotChanged,
  };
};

/**
 * Resolves the next operation_workdays.schedule_version.
 * Reminder generation only advances when timing changes.
 */
export const resolveNextWorkdayScheduleVersion = (
  currentVersion: number,
  impact: Pick<OneTimeScheduleChangeImpact, "reminderScheduleChanged">,
): number => {
  if (impact.reminderScheduleChanged) {
    return currentVersion + 1;
  }
  return currentVersion;
};
