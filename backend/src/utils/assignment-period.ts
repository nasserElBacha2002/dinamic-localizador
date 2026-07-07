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
