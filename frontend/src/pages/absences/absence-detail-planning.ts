import type { AbsenceRequestStatus } from "../../types/absence";
import type {
  AbsenceOperationalConflict,
  AbsenceOperationalImpact,
} from "../../types/absence-operational-impact";
import type { StatusBadgeTone } from "../../design-system";
import { operationStatusLabels } from "../../utils/labels";

export type AbsenceOperationalSummaryLabel =
  | "Pendiente de aprobación"
  | "Aprobada"
  | "Requiere cobertura"
  | "Sin impacto operativo"
  | "Planificación resuelta"
  | "Requiere revisión"
  | "Rechazada"
  | "Cancelada"
  | "Evaluando planificación";

export type AbsencePlanningRow = {
  key: string;
  operationId: string;
  serviceId: string;
  serviceName: string;
  workDate: string;
  shiftLabel: string | null;
  operationStatus: string;
  operationStatusLabel: string;
  situationLabel: string;
  needsCoverage: boolean;
  hasOpenConflict: boolean;
  assignmentId: string;
};

const conflictTypeLabels: Record<string, string> = {
  ASSIGNMENT_DURING_ABSENCE: "Asignación durante la ausencia",
  ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE: "Asistencia registrada en el período",
  RESPONSIBLE_UNAVAILABLE: "Responsable no disponible",
  OPERATION_AFFECTED: "Operación afectada",
};

export type OperationCoverageDeepLinkContext = {
  employeeWorkdayId: string;
  assignmentId: string;
  absentEmployeeId: string;
  absentEmployeeName?: string | null;
  absenceRequestId: string;
  absenceConflictId?: string | null;
  workDate: string;
  shiftLabel?: string | null;
};

export function buildOperationCoverageHref(
  operationId: string,
  context?: OperationCoverageDeepLinkContext | null,
): string {
  if (!context) {
    return `/operations/${operationId}`;
  }
  const params = new URLSearchParams({
    cover: "1",
    employeeWorkdayId: context.employeeWorkdayId,
    assignmentId: context.assignmentId,
    absentEmployeeId: context.absentEmployeeId,
    absenceRequestId: context.absenceRequestId,
    workDate: context.workDate,
  });
  if (context.absenceConflictId) {
    params.set("absenceConflictId", context.absenceConflictId);
  }
  if (context.absentEmployeeName?.trim()) {
    params.set("absentEmployeeName", context.absentEmployeeName.trim());
  }
  if (context.shiftLabel?.trim()) {
    params.set("shiftLabel", context.shiftLabel.trim());
  }
  return `/operations/${operationId}?${params.toString()}`;
}

export function conflictTypeHumanLabel(conflictType: string): string {
  return conflictTypeLabels[conflictType] ?? "Conflicto de planificación";
}

export function findOperationForWorkday(
  impact: AbsenceOperationalImpact,
  operationId: string | null | undefined,
  assignmentId?: string | null,
) {
  if (!operationId) {
    return undefined;
  }
  if (assignmentId) {
    const byAssignment = impact.operations.find(
      (operation) =>
        operation.operationId === operationId && operation.assignmentId === assignmentId,
    );
    if (byAssignment) {
      return byAssignment;
    }
  }
  const matches = impact.operations.filter((operation) => operation.operationId === operationId);
  if (matches.length === 1) {
    return matches[0];
  }
  return undefined;
}

export function conflictMatchesWorkday(
  conflict: AbsenceOperationalConflict,
  workday: AbsenceOperationalImpact["workdays"][number],
  assignmentId: string | null,
): boolean {
  if (
    conflict.employeeWorkdayId &&
    conflict.employeeWorkdayId === workday.employeeWorkdayId
  ) {
    return true;
  }
  if (!workday.operationId || conflict.operationId !== workday.operationId) {
    return false;
  }
  if (conflict.assignmentId && assignmentId) {
    return conflict.assignmentId === assignmentId;
  }
  if (conflict.assignmentId && !assignmentId) {
    return false;
  }
  return true;
}

export function findOpenAssignmentVacancyConflict(
  impact: AbsenceOperationalImpact,
  workday: AbsenceOperationalImpact["workdays"][number],
  assignmentId: string | null,
): AbsenceOperationalConflict | null {
  return (
    impact.openConflicts.find(
      (conflict) =>
        conflict.status === "OPEN" &&
        conflict.conflictType === "ASSIGNMENT_DURING_ABSENCE" &&
        !conflict.replacementEmployeeId &&
        Boolean(conflict.operationId) &&
        conflictMatchesWorkday(conflict, workday, assignmentId),
    ) ?? null
  );
}

export function deriveWorkdayNeedsCoverage(
  impact: AbsenceOperationalImpact,
  requestStatus: AbsenceRequestStatus,
  workday: AbsenceOperationalImpact["workdays"][number],
  operation: AbsenceOperationalImpact["operations"][number] | undefined,
): boolean {
  if (typeof workday.needsCoverage === "boolean") {
    if (requestStatus !== "APPROVED" || !impact.featureEnabled) {
      return false;
    }
    return workday.needsCoverage;
  }

  if (requestStatus !== "APPROVED" || !impact.featureEnabled) {
    return false;
  }
  if (!workday.operationId) {
    return false;
  }
  if (operation?.operationStatus === "CANCELLED") {
    return false;
  }

  return findOpenAssignmentVacancyConflict(
    impact,
    workday,
    operation?.assignmentId ?? null,
  ) != null;
}

export function deriveWorkdayHasOperationalReplacement(
  workday: AbsenceOperationalImpact["workdays"][number],
): boolean {
  return workday.hasOperationalReplacement === true;
}

export function impactHasWorkdaysNeedingCoverage(
  impact: AbsenceOperationalImpact | null | undefined,
  requestStatus: AbsenceRequestStatus,
): boolean {
  if (!impact || !impact.featureEnabled || requestStatus !== "APPROVED") {
    return false;
  }
  return impact.workdays.some((workday) => {
    const operation = findOperationForWorkday(
      impact,
      workday.operationId,
      workday.operationAssignmentId ?? null,
    );
    return deriveWorkdayNeedsCoverage(impact, requestStatus, workday, operation);
  });
}

export function selectPrimaryCoverageOperationId(
  impact: AbsenceOperationalImpact | null | undefined,
  requestStatus: AbsenceRequestStatus,
): string | null {
  if (!impact || !impactHasWorkdaysNeedingCoverage(impact, requestStatus)) {
    return null;
  }

  for (const workday of impact.workdays) {
    const operation = findOperationForWorkday(
      impact,
      workday.operationId,
      workday.operationAssignmentId ?? null,
    );
    if (
      deriveWorkdayNeedsCoverage(impact, requestStatus, workday, operation) &&
      workday.operationId
    ) {
      return workday.operationId;
    }
  }

  return null;
}

export function shouldOfferCoverageAction(
  requestStatus: AbsenceRequestStatus,
  impact: AbsenceOperationalImpact | null | undefined,
): boolean {
  return impactHasWorkdaysNeedingCoverage(impact, requestStatus);
}

export function buildOperationCoverageContext(input: {
  impact: AbsenceOperationalImpact;
  requestId: string;
  row: AbsencePlanningRow;
}): OperationCoverageDeepLinkContext | null {
  const workday = input.impact.workdays.find(
    (item) => item.employeeWorkdayId === input.row.key,
  );
  if (!workday || !input.row.operationId || !input.row.assignmentId) {
    return null;
  }
  const operation = findOperationForWorkday(
    input.impact,
    workday.operationId,
    workday.operationAssignmentId ?? input.row.assignmentId,
  );
  const openConflict = findOpenAssignmentVacancyConflict(
    input.impact,
    workday,
    operation?.assignmentId ?? input.row.assignmentId,
  );
  const absentEmployeeId = operation?.employeeId ?? openConflict?.employeeId;
  if (!absentEmployeeId) {
    return null;
  }
  return {
    employeeWorkdayId: workday.employeeWorkdayId,
    assignmentId: input.row.assignmentId,
    absentEmployeeId,
    absenceRequestId: input.requestId,
    absenceConflictId: openConflict?.id ?? null,
    workDate: workday.workDate,
    shiftLabel: input.row.shiftLabel,
  };
}

export function buildAbsencePlanningRows(
  impact: AbsenceOperationalImpact,
  requestStatus: AbsenceRequestStatus,
): AbsencePlanningRow[] {
  return impact.workdays.map((workday) => {
    const operation = findOperationForWorkday(
      impact,
      workday.operationId,
      workday.operationAssignmentId ?? null,
    );
    const assignmentId = operation?.assignmentId ?? workday.operationAssignmentId ?? "";
    const needsCoverage = deriveWorkdayNeedsCoverage(
      impact,
      requestStatus,
      workday,
      operation,
    );
    const openConflict =
      findOpenAssignmentVacancyConflict(impact, workday, operation?.assignmentId ?? null) ??
      impact.openConflicts.find((conflict) =>
        conflictMatchesWorkday(conflict, workday, operation?.assignmentId ?? null),
      ) ??
      null;

    const operationId = workday.operationId ?? operation?.operationId ?? "";
    const serviceId = workday.serviceId ?? operation?.serviceId ?? "";
    const serviceName = operation?.serviceName ?? "—";
    const operationStatus = operation?.operationStatus ?? "—";

    return {
      key: workday.employeeWorkdayId,
      operationId,
      serviceId,
      serviceName,
      workDate: workday.workDate,
      shiftLabel: operation?.categoryName ?? null,
      operationStatus,
      operationStatusLabel:
        operationStatusLabels[operationStatus as keyof typeof operationStatusLabels] ??
        operationStatus,
      situationLabel: deriveSituationLabel({
        requestStatus,
        needsCoverage,
        openConflict,
        hasOperationalReplacement: deriveWorkdayHasOperationalReplacement(workday),
        hasAttendancePresence: workday.hasAttendancePresence,
        coveredByEmployeeName: workday.coveredByEmployeeName ?? null,
      }),
      needsCoverage,
      hasOpenConflict: Boolean(openConflict),
      assignmentId,
    };
  });
}

export function deriveAbsenceOperationalSummary(input: {
  requestStatus: AbsenceRequestStatus;
  impact: AbsenceOperationalImpact | null | undefined;
  impactLoading?: boolean;
  impactError?: boolean;
}): {
  label: AbsenceOperationalSummaryLabel;
  tone: StatusBadgeTone;
  nextStep: string;
} {
  const { requestStatus, impact, impactLoading, impactError } = input;

  if (requestStatus === "PENDING") {
    return {
      label: "Pendiente de aprobación",
      tone: "warning",
      nextStep: "Revisá la solicitud y confirmá o pedí más información antes de impactar planificación.",
    };
  }

  if (requestStatus === "NEEDS_INFO") {
    return {
      label: "Requiere revisión",
      tone: "info",
      nextStep: "Esperá la información del colaborador o ajustá la solicitud.",
    };
  }

  if (requestStatus === "REJECTED") {
    return {
      label: "Rechazada",
      tone: "danger",
      nextStep: "No requiere acción operativa.",
    };
  }

  if (requestStatus === "CANCELLED") {
    return {
      label: "Cancelada",
      tone: "neutral",
      nextStep: "No requiere acción operativa.",
    };
  }

  if (impactLoading) {
    return {
      label: "Evaluando planificación",
      tone: "neutral",
      nextStep: "Evaluando planificación…",
    };
  }

  if (impactError) {
    return {
      label: "Requiere revisión",
      tone: "warning",
      nextStep: "No se pudo evaluar la planificación afectada.",
    };
  }

  if (!impact || (impact.affectedOperations === 0 && impact.affectedWorkdays === 0)) {
    return {
      label: "Sin impacto operativo",
      tone: "neutral",
      nextStep: "No hay jornadas asignadas superpuestas con esta ausencia.",
    };
  }

  if (impactHasWorkdaysNeedingCoverage(impact, requestStatus)) {
    return {
      label: "Requiere cobertura",
      tone: "warning",
      nextStep:
        "Hay jornadas sin cubrir. Asigná un reemplazo desde la operación afectada.",
    };
  }

  if (impact.openConflicts.length > 0 || impact.requiresManualAction) {
    return {
      label: "Requiere revisión",
      tone: "warning",
      nextStep: "Revisá la planificación afectada y confirmá que no queden pendientes.",
    };
  }

  return {
    label: "Planificación resuelta",
    tone: "success",
    nextStep: "Las jornadas afectadas están cubiertas o sin pendientes operativos.",
  };
}

function deriveSituationLabel(input: {
  requestStatus: AbsenceRequestStatus;
  needsCoverage: boolean;
  openConflict: AbsenceOperationalConflict | null;
  hasOperationalReplacement: boolean;
  hasAttendancePresence: boolean;
  coveredByEmployeeName?: string | null;
}): string {
  if (input.requestStatus !== "APPROVED") {
    if (input.openConflict) {
      return conflictTypeHumanLabel(input.openConflict.conflictType);
    }
    return "Impacto estimado al aprobar";
  }

  if (input.needsCoverage) {
    return "Vacante pendiente";
  }

  if (input.hasAttendancePresence) {
    return "Asistencia registrada — revisar";
  }

  if (input.hasOperationalReplacement) {
    return input.coveredByEmployeeName?.trim()
      ? `Jornada cubierta · ${input.coveredByEmployeeName.trim()}`
      : "Jornada cubierta";
  }

  if (input.openConflict) {
    return conflictTypeHumanLabel(input.openConflict.conflictType);
  }

  return "Sin pendientes";
}

export function buildApprovalImpactPreviewText(
  impact: AbsenceOperationalImpact | null | undefined,
): string | null {
  if (!impact) {
    return null;
  }

  if (impact.affectedOperations === 0 && impact.affectedWorkdays === 0) {
    return "No se detectaron jornadas asignadas en el rango de la ausencia.";
  }

  const parts: string[] = [];
  if (impact.affectedWorkdays > 0) {
    parts.push(
      `${impact.affectedWorkdays} jornada${impact.affectedWorkdays === 1 ? "" : "s"} afectada${impact.affectedWorkdays === 1 ? "" : "s"}`,
    );
  }
  if (impact.attendanceConflicts > 0) {
    parts.push(
      `${impact.attendanceConflicts} registro${impact.attendanceConflicts === 1 ? "" : "s"} de asistencia a revisar`,
    );
  }
  if (impact.openConflicts.length > 0) {
    parts.push(
      `${impact.openConflicts.length} conflicto${impact.openConflicts.length === 1 ? "" : "s"} de planificación`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "Hay operaciones superpuestas con esta ausencia.";
}
