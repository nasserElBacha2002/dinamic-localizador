import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
} from "../../types/employee-workday-availability";

/**
 * Resolves whether a bare LOCATION WhatsApp message should check in, ask for
 * disambiguation, prompt for an explicit checkout command, or no-op.
 *
 * Checkout is never auto-inferred from open attendance alone: the employee must
 * say "Me voy" (or pick a mixed-action option) so LOCATION cannot close a shift.
 */
export type AttendanceLocationIntent =
  | { kind: "CHECK_IN"; candidate: EmployeeWorkdayCheckInCandidate }
  | { kind: "AMBIGUOUS_CHECK_IN"; candidates: EmployeeWorkdayCheckInCandidate[] }
  | {
      kind: "AMBIGUOUS_MIXED";
      checkInCandidates: EmployeeWorkdayCheckInCandidate[];
      checkoutCandidates: EmployeeWorkdayCheckoutCandidate[];
    }
  | {
      /** Open checkout exists but bare LOCATION must not close it. */
      kind: "NEEDS_CHECKOUT_INTENT";
      candidates: EmployeeWorkdayCheckoutCandidate[];
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

  // Checked-in with open checkout: require explicit "Me voy" (or mixed selection).
  if (checkout.length > 0) {
    return { kind: "NEEDS_CHECKOUT_INTENT", candidates: checkout };
  }

  if (checkIn.length === 1) {
    return { kind: "CHECK_IN", candidate: checkIn[0] };
  }

  return { kind: "AMBIGUOUS_CHECK_IN", candidates: checkIn };
};
