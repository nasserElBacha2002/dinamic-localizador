import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
} from "../../types/employee-workday-availability";

/**
 * Resolves whether a bare LOCATION WhatsApp message should check in, check out,
 * ask for disambiguation, or no-op — without picking an arbitrary "first" row.
 */
export type AttendanceLocationIntent =
  | { kind: "CHECK_IN"; candidate: EmployeeWorkdayCheckInCandidate }
  | { kind: "CHECK_OUT"; candidate: EmployeeWorkdayCheckoutCandidate }
  | { kind: "AMBIGUOUS_CHECK_IN"; candidates: EmployeeWorkdayCheckInCandidate[] }
  | { kind: "AMBIGUOUS_CHECK_OUT"; candidates: EmployeeWorkdayCheckoutCandidate[] }
  | {
      kind: "AMBIGUOUS_MIXED";
      checkInCandidates: EmployeeWorkdayCheckInCandidate[];
      checkoutCandidates: EmployeeWorkdayCheckoutCandidate[];
    }
  | { kind: "NONE"; hasJustifiedWorkdayInWindow: boolean };

export const resolveAttendanceLocationIntent = (input: {
  checkInCandidates: EmployeeWorkdayCheckInCandidate[];
  checkoutCandidates: EmployeeWorkdayCheckoutCandidate[];
  hasJustifiedWorkdayInWindow: boolean;
}): AttendanceLocationIntent => {
  const checkIn = input.checkInCandidates;
  const checkout = input.checkoutCandidates;

  if (checkIn.length === 0 && checkout.length === 0) {
    return {
      kind: "NONE",
      hasJustifiedWorkdayInWindow: input.hasJustifiedWorkdayInWindow,
    };
  }

  // Simultaneous open checkout + available check-in cannot be auto-decided safely.
  if (checkIn.length > 0 && checkout.length > 0) {
    return {
      kind: "AMBIGUOUS_MIXED",
      checkInCandidates: checkIn,
      checkoutCandidates: checkout,
    };
  }

  if (checkout.length === 1) {
    return { kind: "CHECK_OUT", candidate: checkout[0] };
  }

  if (checkout.length > 1) {
    return { kind: "AMBIGUOUS_CHECK_OUT", candidates: checkout };
  }

  if (checkIn.length === 1) {
    return { kind: "CHECK_IN", candidate: checkIn[0] };
  }

  return { kind: "AMBIGUOUS_CHECK_IN", candidates: checkIn };
};
