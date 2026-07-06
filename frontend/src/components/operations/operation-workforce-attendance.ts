import type { OperationAttendanceSummaryEmployee } from "../../types/operation-attendance-summary";

export const canReviewOperationalAttendance = (
  row: OperationAttendanceSummaryEmployee,
): boolean => {
  if (!row.attendance || row.attendance.reviewedAt) {
    return false;
  }

  return (
    row.attendance.validationStatus === "PENDING_REVIEW" ||
    row.attendance.validationStatus === "REJECTED"
  );
};
