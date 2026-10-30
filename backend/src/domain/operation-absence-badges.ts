import type {
  AbsenceOperationalConflictDto,
  OperationAbsenceBadge,
  OperationAbsenceBadgeCode,
} from "../types/absence-operational-impact";

const BADGE_LABELS: Record<OperationAbsenceBadgeCode, string> = {
  ABSENT: "Ausente",
  PARTIAL_ABSENCE: "Ausencia parcial",
  REPLACEMENT_PENDING: "Vacante por ausencia",
  REPLACED: "Cobertura activa",
  OPEN_CONFLICT: "Planificación pendiente",
  RESOLVED_CONFLICT: "Planificación resuelta",
};

export type OperationAbsenceActiveWorkdayCoverage = {
  replacementEmployeeId: string;
  replacementEmployeeName?: string | null;
  absenceRequestId?: string | null;
};

export type OperationAbsenceBadgeInput = {
  employeeId: string;
  assignmentId: string;
  expectationStatus?: string | null;
  availabilityStatus?: string | null;
  conflicts: AbsenceOperationalConflictDto[];
  /** Active workday-scoped coverage (Phase 3). Not inferred from resolved conflicts alone. */
  activeWorkdayCoverage?: OperationAbsenceActiveWorkdayCoverage | null;
};

/**
 * Pure badge matrix for operational surfaces (no medical/sensitive fields).
 */
export const resolveOperationAbsenceBadges = (
  input: OperationAbsenceBadgeInput,
): OperationAbsenceBadge[] => {
  const badges: OperationAbsenceBadge[] = [];
  const seen = new Set<OperationAbsenceBadgeCode>();

  const push = (
    code: OperationAbsenceBadgeCode,
    meta: {
      absenceRequestId?: string | null;
      conflictId?: string | null;
      replacementEmployeeId?: string | null;
    } = {},
  ) => {
    if (seen.has(code)) {
      return;
    }
    seen.add(code);
    badges.push({
      code,
      label: BADGE_LABELS[code],
      absenceRequestId: meta.absenceRequestId ?? null,
      conflictId: meta.conflictId ?? null,
      replacementEmployeeId: meta.replacementEmployeeId ?? null,
      employeeId: input.employeeId,
      assignmentId: input.assignmentId,
    });
  };

  const related = input.conflicts.filter(
    (c) =>
      c.employeeId === input.employeeId ||
      c.assignmentId === input.assignmentId ||
      c.replacementEmployeeId === input.employeeId,
  );

  const activeCoverage = input.activeWorkdayCoverage;
  const titularHasActiveCoverage =
    Boolean(activeCoverage?.replacementEmployeeId) &&
    activeCoverage!.replacementEmployeeId !== input.employeeId;

  const openAssignment = related.find(
    (c) =>
      c.status === "OPEN" &&
      c.conflictType === "ASSIGNMENT_DURING_ABSENCE" &&
      c.assignmentId === input.assignmentId &&
      !titularHasActiveCoverage,
  );
  if (openAssignment) {
    push("REPLACEMENT_PENDING", {
      absenceRequestId: openAssignment.absenceRequestId,
      conflictId: openAssignment.id,
    });
  }

  if (titularHasActiveCoverage && activeCoverage) {
    push("REPLACED", {
      absenceRequestId:
        activeCoverage.absenceRequestId ??
        related.find((c) => c.assignmentId === input.assignmentId)?.absenceRequestId ??
        null,
      replacementEmployeeId: activeCoverage.replacementEmployeeId,
    });
  }

  const assignReplacementResolved = related.find(
    (c) =>
      c.status === "RESOLVED" &&
      c.resolutionCode === "ASSIGN_REPLACEMENT" &&
      c.assignmentId === input.assignmentId &&
      c.employeeId === input.employeeId,
  );
  if (assignReplacementResolved && !titularHasActiveCoverage) {
    push("RESOLVED_CONFLICT", {
      absenceRequestId: assignReplacementResolved.absenceRequestId,
      conflictId: assignReplacementResolved.id,
      replacementEmployeeId: assignReplacementResolved.replacementEmployeeId,
    });
  }

  const otherOpen = related.find(
    (c) => c.status === "OPEN" && c.id !== openAssignment?.id,
  );
  if (otherOpen) {
    push("OPEN_CONFLICT", {
      absenceRequestId: otherOpen.absenceRequestId,
      conflictId: otherOpen.id,
    });
  }

  const otherResolved = related.find(
    (c) =>
      (c.status === "RESOLVED" || c.status === "DISMISSED") &&
      c.id !== assignReplacementResolved?.id,
  );
  if (otherResolved) {
    push("RESOLVED_CONFLICT", {
      absenceRequestId: otherResolved.absenceRequestId,
      conflictId: otherResolved.id,
    });
  }

  if (
    input.expectationStatus === "JUSTIFIED" ||
    input.availabilityStatus === "UNAVAILABLE"
  ) {
    push("ABSENT", {
      absenceRequestId: related[0]?.absenceRequestId ?? null,
    });
  } else if (
    input.availabilityStatus === "PARTIALLY_UNAVAILABLE" ||
    input.availabilityStatus === "PROVISIONALLY_UNAVAILABLE"
  ) {
    push("PARTIAL_ABSENCE", {
      absenceRequestId: related[0]?.absenceRequestId ?? null,
    });
  }

  return badges;
};
