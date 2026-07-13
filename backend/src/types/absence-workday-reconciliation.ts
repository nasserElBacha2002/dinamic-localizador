export interface AbsenceWorkdayReconciliationResult {
  justified: number;
  restored: number;
  relinked: number;
  unchanged: number;
  attendanceConflicts: number;
}

export const emptyAbsenceWorkdayReconciliationResult = (): AbsenceWorkdayReconciliationResult => ({
  justified: 0,
  restored: 0,
  relinked: 0,
  unchanged: 0,
  attendanceConflicts: 0,
});

export const mergeAbsenceWorkdayReconciliationResults = (
  left: AbsenceWorkdayReconciliationResult,
  right: AbsenceWorkdayReconciliationResult,
): AbsenceWorkdayReconciliationResult => ({
  justified: left.justified + right.justified,
  restored: left.restored + right.restored,
  relinked: left.relinked + right.relinked,
  unchanged: left.unchanged + right.unchanged,
  attendanceConflicts: left.attendanceConflicts + right.attendanceConflicts,
});
