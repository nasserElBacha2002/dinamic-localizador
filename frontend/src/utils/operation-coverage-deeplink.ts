import type { CoverageAssignmentTarget } from "../components/operations/OperationIndividualAssignmentPanel";

export type ParsedOperationCoverageDeepLink = {
  employeeWorkdayId: string;
  assignmentId: string;
  absentEmployeeId: string;
  absentEmployeeName?: string | null;
  absenceRequestId: string;
  absenceConflictId?: string | null;
  workDate: string;
  shiftLabel?: string | null;
};

export function parseOperationCoverageSearchParams(
  params: URLSearchParams,
): ParsedOperationCoverageDeepLink | null {
  if (params.get("cover") !== "1") {
    return null;
  }
  const employeeWorkdayId = params.get("employeeWorkdayId")?.trim() ?? "";
  const assignmentId = params.get("assignmentId")?.trim() ?? "";
  const absentEmployeeId = params.get("absentEmployeeId")?.trim() ?? "";
  const absenceRequestId = params.get("absenceRequestId")?.trim() ?? "";
  const workDate = params.get("workDate")?.trim() ?? "";
  if (
    !employeeWorkdayId ||
    !assignmentId ||
    !absentEmployeeId ||
    !absenceRequestId ||
    !workDate
  ) {
    return null;
  }
  return {
    employeeWorkdayId,
    assignmentId,
    absentEmployeeId,
    absentEmployeeName: params.get("absentEmployeeName"),
    absenceRequestId,
    absenceConflictId: params.get("absenceConflictId"),
    workDate,
    shiftLabel: params.get("shiftLabel"),
  };
}

export function buildCoverageTargetFromDeepLink(
  link: ParsedOperationCoverageDeepLink,
): CoverageAssignmentTarget {
  return {
    replacedAssignmentId: link.assignmentId,
    replacedEmployeeId: link.absentEmployeeId,
    replacedEmployeeName: link.absentEmployeeName ?? undefined,
    shiftLabel: link.shiftLabel ?? null,
    employeeWorkdayId: link.employeeWorkdayId,
    absenceRequestId: link.absenceRequestId,
    absenceConflictId: link.absenceConflictId ?? null,
    workDateLabel: link.workDate,
    pendingCoverageLabel: "Pendiente de cobertura",
  };
}

export function newCoverageCommandId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `coverage-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
