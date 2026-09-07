import type { PunctualityStatus } from "../types/domain";

/**
 * Channel-neutral check-in temporal policy (inclusive edges):
 *
 *   opensAt  = expectedStartAt - earlyToleranceMinutes
 *   closesAt = expectedStartAt + lateToleranceMinutes
 *
 *   now < opensAt              → unavailable (BEFORE_CHECK_IN_WINDOW)
 *   opensAt <= now <= closesAt → available
 *   now > closesAt             → unavailable (AFTER_EXPECTED_END, legacy reason code)
 *
 * Punctuality when available:
 *   now < expectedStartAt                     → EARLY
 *   expectedStartAt <= now <= closesAt        → ON_TIME
 */

export type CheckInWindowInput = {
  expectedStartAt: string | Date;
  expectedEndAt?: string | Date | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
};

export type CheckInWindowRejectionReason = "BEFORE_CHECK_IN_WINDOW" | "AFTER_EXPECTED_END";

export type CheckInWindowEvaluation = {
  available: boolean;
  punctuality: Extract<PunctualityStatus, "EARLY" | "ON_TIME"> | null;
  opensAt: Date;
  closesAt: Date;
  onTimeUntil: Date;
  expectedStartAt: Date;
  rejectionReason?: CheckInWindowRejectionReason;
};

const toDate = (value: string | Date): Date =>
  value instanceof Date ? value : new Date(value);

export const resolveCheckInWindowBounds = (
  schedule: CheckInWindowInput,
): { opensAt: Date; closesAt: Date; expectedStartAt: Date; onTimeUntil: Date } => {
  const expectedStartAt = toDate(schedule.expectedStartAt);
  const opensAt = new Date(
    expectedStartAt.getTime() - schedule.earlyToleranceMinutes * 60_000,
  );
  const onTimeUntil = new Date(
    expectedStartAt.getTime() + schedule.lateToleranceMinutes * 60_000,
  );

  const closesAt = onTimeUntil;

  return { opensAt, closesAt, expectedStartAt, onTimeUntil };
};

export const evaluateCheckInWindow = (
  schedule: CheckInWindowInput,
  at: Date,
): CheckInWindowEvaluation => {
  const { opensAt, closesAt, expectedStartAt, onTimeUntil } =
    resolveCheckInWindowBounds(schedule);

  if (at < opensAt) {
    return {
      available: false,
      punctuality: null,
      opensAt,
      closesAt,
      onTimeUntil,
      expectedStartAt,
      rejectionReason: "BEFORE_CHECK_IN_WINDOW",
    };
  }

  if (at > closesAt) {
    return {
      available: false,
      punctuality: null,
      opensAt,
      closesAt,
      onTimeUntil,
      expectedStartAt,
      rejectionReason: "AFTER_EXPECTED_END",
    };
  }

  let punctuality: CheckInWindowEvaluation["punctuality"];
  if (at < expectedStartAt) {
    punctuality = "EARLY";
  } else {
    punctuality = "ON_TIME";
  }

  return {
    available: true,
    punctuality,
    opensAt,
    closesAt,
    onTimeUntil,
    expectedStartAt,
  };
};

/**
 * Centralized check-in availability for bot listing and command revalidation.
 * Uses operation workday snapshot tolerances (not live company defaults).
 */
export const isWithinCheckInAvailabilityWindow = (
  schedule: CheckInWindowInput,
  at: Date,
): boolean => evaluateCheckInWindow(schedule, at).available;

export const resolveCheckInCandidateRange = (
  at: Date,
  input?: { lookbackHours?: number; lookaheadHours?: number },
): { candidateFrom: Date; candidateTo: Date } => {
  const lookbackHours = input?.lookbackHours ?? 30;
  const lookaheadHours = input?.lookaheadHours ?? 30;
  return {
    candidateFrom: new Date(at.getTime() - lookbackHours * 60 * 60 * 1000),
    candidateTo: new Date(at.getTime() + lookaheadHours * 60 * 60 * 1000),
  };
};
