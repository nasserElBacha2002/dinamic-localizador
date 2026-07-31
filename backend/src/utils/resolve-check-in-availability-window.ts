import type { PunctualityStatus } from "../types/domain";

/**
 * Check-in temporal policy (inclusive/exclusive edges):
 *
 *   opensAt  = expectedStartAt - earlyToleranceMinutes
 *   closesAt = expectedEndAt   (or start + lateTolerance when end is missing)
 *
 *   now < opensAt              → unavailable (BEFORE_CHECK_IN_WINDOW)
 *   opensAt <= now < closesAt  → available
 *   now >= closesAt            → unavailable (AFTER_EXPECTED_END)
 *
 * Punctuality when available:
 *   now < expectedStartAt                         → EARLY
 *   expectedStartAt <= now <= start + lateTol     → ON_TIME
 *   start + lateTol < now < closesAt              → LATE
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
  punctuality: Extract<PunctualityStatus, "EARLY" | "ON_TIME" | "LATE"> | null;
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

  const endRaw = schedule.expectedEndAt;
  const closesAt =
    endRaw != null && String(endRaw).trim() !== ""
      ? toDate(endRaw)
      : onTimeUntil;

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

  if (at >= closesAt) {
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
  } else if (at <= onTimeUntil) {
    punctuality = "ON_TIME";
  } else {
    punctuality = "LATE";
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
 * Uses operation workday snapshot tolerances and expected end (not live schedule).
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
