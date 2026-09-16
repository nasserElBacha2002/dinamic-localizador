export type DailyAttendanceReportClassifyKind =
  | "JUSTIFIED"
  | "UNAVAILABLE"
  | "PENDING_CONFIRMATION"
  | "PRESENT"
  | "LATE"
  | "EARLY_LEAVE"
  | "MISSING_CHECKIN"
  | "MISSING_CHECKOUT"
  | "INCOMPLETE";

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

/**
 * Pure classification for one employee_workday row at report cutoff.
 * Cancelled expectations must be filtered before calling this.
 */
export const classifyDailyAttendanceReportRow = (input: {
  expectationStatus: string;
  confirmationStatus: string | null;
  punctualityStatus: string | null;
  expectedStartAt: Date;
  expectedEndAt: Date | null;
  receivedAt: Date | null;
  checkoutAt: Date | null;
  lateToleranceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  cutoffAt: Date;
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
  const windowClosed =
    input.expectedEndAt == null
      ? checkinDueAt.getTime() <= input.cutoffAt.getTime()
      : input.expectedEndAt.getTime() <= input.cutoffAt.getTime();

  if (input.receivedAt) {
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
    } else if (windowClosed && input.expectedEndAt) {
      result.missingCheckout = true;
    } else if (input.expectedEndAt && input.expectedEndAt.getTime() > input.cutoffAt.getTime()) {
      result.incomplete = true;
    }
  } else if (input.confirmationStatus === "UNAVAILABLE") {
    // counted as unavailable; not missing check-in
  } else if (checkinDueAt.getTime() <= input.cutoffAt.getTime()) {
    result.missingCheckin = true;
  } else {
    result.incomplete = true;
  }

  return result;
};
