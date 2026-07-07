/**
 * Canonical production attendance per EmployeeWorkday when legacy duplicates exist.
 * DB invariant: UX_attendance_records_employee_workday_active_real (one real row per workday).
 * Ordering prefers operational validity, then the latest received check-in.
 */
export const CANONICAL_ATTENDANCE_ORDER_BY = `
  CASE ar.validation_status
    WHEN N'VALID' THEN 1
    WHEN N'PENDING_REVIEW' THEN 2
    WHEN N'REJECTED' THEN 3
    ELSE 4
  END,
  ar.received_at DESC,
  ar.id DESC
`;

export const CANONICAL_PRODUCTION_ATTENDANCE_APPLY = `
  OUTER APPLY (
    SELECT TOP 1
      ar.id,
      ar.received_at,
      ar.checkout_at,
      ar.punctuality_status,
      ar.validation_status,
      ar.location_status,
      ar.checkout_status,
      ar.reviewed_at,
      ar.extra_worked_minutes
    FROM attendance_records ar
    WHERE ar.employee_workday_id = ew.id
      AND ar.company_id = ew.company_id
      AND ar.is_simulation = 0
    ORDER BY ${CANONICAL_ATTENDANCE_ORDER_BY}
  ) ar
`;

const validationStatusRank = (status: string): number => {
  switch (status) {
    case "VALID":
      return 1;
    case "PENDING_REVIEW":
      return 2;
    case "REJECTED":
      return 3;
    default:
      return 4;
  }
};

export interface CanonicalAttendanceCandidate {
  id: string;
  validationStatus: string;
  receivedAt: Date;
  isSimulation: boolean;
}

/** Mirrors SQL canonical production attendance selection for contract tests. */
export const selectCanonicalProductionAttendance = <T extends CanonicalAttendanceCandidate>(
  records: T[],
): T | null => {
  const production = records.filter((record) => !record.isSimulation);
  if (production.length === 0) {
    return null;
  }

  return [...production].sort((left, right) => {
    const rankDiff = validationStatusRank(left.validationStatus) - validationStatusRank(right.validationStatus);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const receivedDiff = right.receivedAt.getTime() - left.receivedAt.getTime();
    if (receivedDiff !== 0) {
      return receivedDiff;
    }

    return left.id.localeCompare(right.id);
  })[0]!;
};
