/**
 * Pure classification for one employee_workday row at evaluation time.
 * Cancelled expectations must be filtered before calling this.
 *
 * Classification clock is `evaluatedAt` (persisted generation instant), NOT local midnight.
 * Checkout window closes at expectedEndAt + earlyLeaveToleranceMinutes.
 * Belonging to the report is always by operation_workdays.work_date (caller filter).
 */
export type DailyAttendanceReportRowClassification = {
  justified: boolean;
  unavailable: boolean;
  pendingConfirmation: boolean;
  present: boolean;
  late: boolean;
  earlyLeave: boolean;
  missingCheckin: boolean;
  missingCheckout: boolean;
  incomplete: boolean;
  hasCheckout: boolean;
};

export const classifyDailyAttendanceReportRow = (input: {
  expectationStatus: string;
  confirmationStatus: string | null;
  punctualityStatus: string | null;
  validationStatus: string | null;
  expectedStartAt: Date;
  expectedEndAt: Date | null;
  receivedAt: Date | null;
  checkoutAt: Date | null;
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  /** Real generation / evaluation instant (UTC). */
  evaluatedAt: Date;
}): DailyAttendanceReportRowClassification => {
  const result: DailyAttendanceReportRowClassification = {
    justified: false,
    unavailable: false,
    pendingConfirmation: false,
    present: false,
    late: false,
    earlyLeave: false,
    missingCheckin: false,
    missingCheckout: false,
    incomplete: false,
    hasCheckout: false,
  };

  if (input.expectationStatus === "JUSTIFIED") {
    result.justified = true;
    return result;
  }

  if (input.confirmationStatus === "UNAVAILABLE") {
    result.unavailable = true;
  } else if (input.confirmationStatus === "PENDING") {
    result.pendingConfirmation = true;
  }

  const lateToleranceMs = input.lateToleranceMinutes * 60_000;
  const earlyLeaveMs = input.earlyLeaveToleranceMinutes * 60_000;
  const checkinDueAt = new Date(input.expectedStartAt.getTime() + lateToleranceMs);
  const checkoutDueAt =
    input.expectedEndAt == null
      ? null
      : new Date(input.expectedEndAt.getTime() + earlyLeaveMs);
  const operationallyPresent =
    Boolean(input.receivedAt) &&
    (input.validationStatus === "VALID" || input.validationStatus === "PENDING_REVIEW");

  if (operationallyPresent && input.receivedAt) {
    result.present = true;
    if (String(input.punctualityStatus ?? "") === "LATE") {
      result.late = true;
    }
    if (input.checkoutAt) {
      result.hasCheckout = true;
      if (
        input.expectedEndAt &&
        input.checkoutAt.getTime() < input.expectedEndAt.getTime() - earlyLeaveMs
      ) {
        result.earlyLeave = true;
      }
    } else if (checkoutDueAt && checkoutDueAt.getTime() <= input.evaluatedAt.getTime()) {
      // Night shift (or any shift) ended before evaluation without checkout.
      result.missingCheckout = true;
    } else if (checkoutDueAt && checkoutDueAt.getTime() > input.evaluatedAt.getTime()) {
      result.incomplete = true;
    } else if (!checkoutDueAt) {
      // No expected end: treat as incomplete until check-in due window also passed? keep incomplete.
      result.incomplete = true;
    }
  } else if (input.confirmationStatus === "UNAVAILABLE") {
    // counted as unavailable; not missing check-in
  } else if (checkinDueAt.getTime() <= input.evaluatedAt.getTime()) {
    result.missingCheckin = true;
  } else {
    result.incomplete = true;
  }

  return result;
};
