import type { AssignmentLifecycleState } from "../constants/assignment-lifecycle";

const OPEN_ENDED_SENTINEL = "9999-12-31";

export const compareAssignmentDates = (left: string, right: string): number =>
  left.localeCompare(right);

export const isAssignmentActiveOnWorkDate = (input: {
  validFrom: string;
  validUntil: string | null;
  workDate: string;
  cancelledAt?: string | null;
}): boolean => {
  if (input.cancelledAt) {
    return false;
  }

  if (compareAssignmentDates(input.workDate, input.validFrom) < 0) {
    return false;
  }

  if (input.validUntil && compareAssignmentDates(input.workDate, input.validUntil) > 0) {
    return false;
  }

  return true;
};

export const doAssignmentPeriodsOverlap = (input: {
  validFrom: string;
  validUntil: string | null;
  otherValidFrom: string;
  otherValidUntil: string | null;
}): boolean => {
  const leftEnd = input.validUntil ?? OPEN_ENDED_SENTINEL;
  const rightEnd = input.otherValidUntil ?? OPEN_ENDED_SENTINEL;

  return (
    compareAssignmentDates(input.validFrom, rightEnd) <= 0 &&
    compareAssignmentDates(input.otherValidFrom, leftEnd) <= 0
  );
};

export type AssignmentPeriodConflict =
  | "already_assigned"
  | "assignment_period_overlap"
  | "no_overlap";

const periodsAreEquivalent = (
  leftFrom: string,
  leftUntil: string | null,
  rightFrom: string,
  rightUntil: string | null,
): boolean => leftFrom === rightFrom && leftUntil === rightUntil;

export const assignmentPeriodsOverlap = (input: {
  existing: { validFrom: string; validUntil: string | null; cancelledAt?: string | null };
  requested: { validFrom: string; validUntil: string | null };
}): AssignmentPeriodConflict => {
  if (input.existing.cancelledAt) {
    return "no_overlap";
  }

  if (
    !doAssignmentPeriodsOverlap({
      validFrom: input.requested.validFrom,
      validUntil: input.requested.validUntil,
      otherValidFrom: input.existing.validFrom,
      otherValidUntil: input.existing.validUntil,
    })
  ) {
    return "no_overlap";
  }

  if (
    periodsAreEquivalent(
      input.existing.validFrom,
      input.existing.validUntil,
      input.requested.validFrom,
      input.requested.validUntil,
    )
  ) {
    return "already_assigned";
  }

  return "assignment_period_overlap";
};

export const resolveAssignmentLifecycleState = (
  assignment: { validFrom: string; validUntil: string | null; cancelledAt?: string | null },
  referenceDate: string,
): AssignmentLifecycleState | null => {
  if (assignment.cancelledAt) {
    return null;
  }
  if (assignment.validUntil && compareAssignmentDates(assignment.validUntil, referenceDate) < 0) {
    return "ENDED";
  }

  if (compareAssignmentDates(assignment.validFrom, referenceDate) > 0) {
    return "FUTURE";
  }

  return "CURRENT";
};

export const assertValidAssignmentDateRange = (
  validFrom: string,
  validUntil: string | null,
): void => {
  if (validUntil && compareAssignmentDates(validUntil, validFrom) < 0) {
    throw new Error("ASSIGNMENT_INVALID_DATE_RANGE");
  }
};
