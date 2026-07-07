import { isWithinOperationWindow } from "./attendance-validation";

export type CheckInWindowInput = {
  expectedStartAt: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
};

/**
 * Centralized check-in availability window for bot listing and command revalidation.
 * Uses operation workday snapshot tolerances (not live recurring schedule).
 */
export const isWithinCheckInAvailabilityWindow = (
  schedule: CheckInWindowInput,
  at: Date,
): boolean =>
  isWithinOperationWindow(
    at,
    new Date(schedule.expectedStartAt),
    schedule.earlyToleranceMinutes,
    schedule.lateToleranceMinutes,
  );

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
