import {
  ATTENDANCE_REMINDER_LEAD_MINUTES,
  NO_CHECKIN_AT_START_WINDOW_MINUTES,
} from "../constants/attendance-notification";
import { buildOperationStartDueWindow, buildReminderDueWindow } from "./reminder-time-window";

export type ReminderOperationKind = "ONE_TIME" | "RECURRING";

export interface WorkdayReminderEligibilityInput {
  operationKind: ReminderOperationKind;
  operationStatus: "SCHEDULED" | "IN_PROGRESS" | "CANCELLED" | "COMPLETED" | string;
  operationWorkdayStatus: "ACTIVE" | "CANCELLED" | string;
  employeeWorkdayExpectation: "EXPECTED" | "JUSTIFIED" | "CANCELLED" | string;
  employeeActive: boolean;
  assignmentCancelled: boolean;
  hasValidCheckIn: boolean;
  hasCheckout: boolean;
  expectedStartAt: Date;
  expectedEndAt: Date | null;
  referenceAt: Date;
  arrivalLeadMinutes?: number;
  noCheckInWindowMinutes?: number;
}

export interface WorkdayReminderEligibilityResult {
  arrivalCandidate: boolean;
  noCheckInCandidate: boolean;
  exitCandidate: boolean;
  rejectionReasons: string[];
}

const baseEligible = (input: WorkdayReminderEligibilityInput): string[] => {
  const reasons: string[] = [];

  if (input.operationStatus === "CANCELLED") {
    reasons.push("OPERATION_CANCELLED");
  }
  if (input.operationStatus === "COMPLETED") {
    reasons.push("OPERATION_COMPLETED");
  }
  if (input.operationWorkdayStatus !== "ACTIVE") {
    reasons.push("OPERATION_WORKDAY_INACTIVE");
  }
  if (input.employeeWorkdayExpectation !== "EXPECTED") {
    reasons.push("EMPLOYEE_WORKDAY_NOT_EXPECTED");
  }
  if (!input.employeeActive) {
    reasons.push("EMPLOYEE_INACTIVE");
  }
  if (input.assignmentCancelled) {
    reasons.push("ASSIGNMENT_CANCELLED");
  }

  return reasons;
};

/**
 * Pure mirror of workday-based reminder windows used by the scheduler SQL.
 * Times are absolute instants (UTC Date); company timezone is already baked into expected_* storage.
 */
export const evaluateWorkdayReminderEligibility = (
  input: WorkdayReminderEligibilityInput,
): WorkdayReminderEligibilityResult => {
  const rejectionReasons = baseEligible(input);
  const arrivalWindow = buildReminderDueWindow(
    input.referenceAt,
    input.arrivalLeadMinutes ?? ATTENDANCE_REMINDER_LEAD_MINUTES,
  );
  const noCheckInWindow = buildOperationStartDueWindow(
    input.referenceAt,
    input.noCheckInWindowMinutes ?? NO_CHECKIN_AT_START_WINDOW_MINUTES,
  );
  const exitWindow = buildReminderDueWindow(
    input.referenceAt,
    input.arrivalLeadMinutes ?? ATTENDANCE_REMINDER_LEAD_MINUTES,
  );

  const baseOk = rejectionReasons.length === 0;
  const completedBlocksArrivalAndNoCheckIn = input.operationStatus === "COMPLETED";

  const inArrivalWindow =
    input.expectedStartAt >= arrivalWindow.windowStart &&
    input.expectedStartAt <= arrivalWindow.windowEnd;

  const inNoCheckInWindow =
    input.expectedStartAt >= noCheckInWindow.windowStart &&
    input.expectedStartAt <= noCheckInWindow.windowEnd;

  const inExitWindow =
    input.expectedEndAt !== null &&
    input.expectedEndAt >= exitWindow.windowStart &&
    input.expectedEndAt <= exitWindow.windowEnd;

  const arrivalCandidate =
    baseOk &&
    !completedBlocksArrivalAndNoCheckIn &&
    !input.hasValidCheckIn &&
    inArrivalWindow;

  const noCheckInCandidate =
    baseOk &&
    !completedBlocksArrivalAndNoCheckIn &&
    !input.hasValidCheckIn &&
    inNoCheckInWindow;

  const exitCandidate =
    baseOk &&
    !completedBlocksArrivalAndNoCheckIn &&
    input.hasValidCheckIn &&
    !input.hasCheckout &&
    inExitWindow;

  if (!arrivalCandidate && !inArrivalWindow && !input.hasValidCheckIn) {
    if (input.expectedStartAt > arrivalWindow.windowEnd) {
      rejectionReasons.push("BEFORE_ARRIVAL_WINDOW");
    } else if (input.expectedStartAt < arrivalWindow.windowStart) {
      rejectionReasons.push("AFTER_ARRIVAL_WINDOW");
    }
  }
  if (input.hasValidCheckIn) {
    rejectionReasons.push("CHECK_IN_EXISTS");
  }
  if (input.hasCheckout) {
    rejectionReasons.push("CHECKOUT_EXISTS");
  }

  return {
    arrivalCandidate,
    noCheckInCandidate,
    exitCandidate,
    rejectionReasons: [...new Set(rejectionReasons)],
  };
};

/** Idempotency schedule_version used for RECURRING workdays (YYYYMMDD of work_date). */
export const recurringReminderScheduleVersion = (workDate: Date): number =>
  workDate.getUTCFullYear() * 10000 + (workDate.getUTCMonth() + 1) * 100 + workDate.getUTCDate();

export const countCandidatesByOperationKind = <T extends { operationKind?: string }>(
  candidates: T[],
): { ONE_TIME: number; RECURRING: number; OTHER: number } => {
  const counts = { ONE_TIME: 0, RECURRING: 0, OTHER: 0 };
  for (const candidate of candidates) {
    if (candidate.operationKind === "ONE_TIME") {
      counts.ONE_TIME += 1;
    } else if (candidate.operationKind === "RECURRING") {
      counts.RECURRING += 1;
    } else {
      counts.OTHER += 1;
    }
  }
  return counts;
};
