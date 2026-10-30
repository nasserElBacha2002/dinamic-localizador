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
  | "Cancelada";

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

export function buildOperationCoverageHref(operationId: string): string {
  return `/operations/${operationId}`;
}

export function conflictTypeHumanLabel(conflictType: string): string {
  return conflictTypeLabels[conflictType] ?? "Conflicto de planificación";
}

export function hasUncoveredWorkdays(impact: AbsenceOperationalImpact | null | undefined): boolean {
  if (!impact) {
    return false;
  }
  return impact.workdays.some((workday) => !workday.covered);
}

export function selectPrimaryCoverageOperationId(
  impact: AbsenceOperationalImpact | null | undefined,
): string | null {
  if (!impact || !hasUncoveredWorkdays(impact)) {
    return null;
  }

  const uncovered = impact.workdays.find((workday) => !workday.covered && workday.operationId);
  if (uncovered?.operationId) {
    return uncovered.operationId;
  }

  const operationRow = impact.operations[0];
  return operationRow?.operationId ?? null;
}

export function shouldOfferCoverageAction(
  requestStatus: AbsenceRequestStatus,
  impact: AbsenceOperationalImpact | null | undefined,
): boolean {
  return requestStatus === "APPROVED" && hasUncoveredWorkdays(impact);
}

export function buildAbsencePlanningRows(
  impact: AbsenceOperationalImpact,
  requestStatus: AbsenceRequestStatus,
): AbsencePlanningRow[] {
  const conflictsByOperation = groupOpenConflictsByOperation(impact.openConflicts);

  return impact.operations.map((operation) => {
    const workday = pickWorkdayForOperation(impact, operation.operationId, operation.assignmentId);
    const openConflict = conflictsByOperation.get(operation.operationId)?.[0] ?? null;
    const needsCoverage =
      requestStatus === "APPROVED" && workday != null && !workday.covered;

    return {
      key: `${operation.operationId}:${operation.assignmentId}`,
      operationId: operation.operationId,
      serviceId: operation.serviceId,
      serviceName: operation.serviceName,
      workDate: workday?.workDate ?? operation.scheduledStart.slice(0, 10),
      shiftLabel: operation.categoryName,
      operationStatus: operation.operationStatus,
      operationStatusLabel:
        operationStatusLabels[operation.operationStatus as keyof typeof operationStatusLabels] ??
        operation.operationStatus,
      situationLabel: deriveSituationLabel({
        requestStatus,
        needsCoverage,
        openConflict,
        workdayCovered: workday?.covered ?? null,
        hasAttendancePresence: workday?.hasAttendancePresence ?? false,
      }),
      needsCoverage,
      hasOpenConflict: Boolean(openConflict),
      assignmentId: operation.assignmentId,
    };
  });
}

export function deriveAbsenceOperationalSummary(input: {
  requestStatus: AbsenceRequestStatus;
  impact: AbsenceOperationalImpact | null | undefined;
}): {
  label: AbsenceOperationalSummaryLabel;
  tone: StatusBadgeTone;
  nextStep: string;
} {
  const { requestStatus, impact } = input;

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

  if (!impact || (impact.affectedOperations === 0 && impact.affectedWorkdays === 0)) {
    return {
      label: "Sin impacto operativo",
      tone: "neutral",
      nextStep: "No hay jornadas asignadas superpuestas con esta ausencia.",
    };
  }

  if (hasUncoveredWorkdays(impact)) {
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

function groupOpenConflictsByOperation(
  conflicts: AbsenceOperationalConflict[],
): Map<string, AbsenceOperationalConflict[]> {
  const map = new Map<string, AbsenceOperationalConflict[]>();
  for (const conflict of conflicts) {
    if (!conflict.operationId) {
      continue;
    }
    const list = map.get(conflict.operationId) ?? [];
    list.push(conflict);
    map.set(conflict.operationId, list);
  }
  return map;
}

function pickWorkdayForOperation(
  impact: AbsenceOperationalImpact,
  operationId: string,
  assignmentId: string,
) {
  return (
    impact.workdays.find(
      (workday) => workday.operationId === operationId && workday.employeeWorkdayId,
    ) ??
    impact.workdays.find((workday) => workday.operationId === operationId) ??
    impact.workdays.find((workday) => workday.employeeWorkdayId === assignmentId) ??
    null
  );
}

function deriveSituationLabel(input: {
  requestStatus: AbsenceRequestStatus;
  needsCoverage: boolean;
  openConflict: AbsenceOperationalConflict | null;
  workdayCovered: boolean | null;
  hasAttendancePresence: boolean;
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

  if (input.openConflict) {
    return conflictTypeHumanLabel(input.openConflict.conflictType);
  }

  if (input.workdayCovered === true) {
    return "Jornada cubierta";
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
