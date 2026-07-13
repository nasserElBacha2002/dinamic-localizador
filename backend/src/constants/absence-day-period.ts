/**
 * Partial-day absence boundaries in the operational local timezone.
 *
 * The absence domain does not define company-specific AM/PM cutoffs; this is the
 * centralized technical convention aligned with calculateTotalAbsenceDays semantics.
 *
 * Intervals are half-open: [start, end).
 */
export const ABSENCE_PARTIAL_DAY_BOUNDARY_HOUR = 12;

export const ABSENCE_PARTIAL_DAY_BOUNDARY_TIME = "12:00";
