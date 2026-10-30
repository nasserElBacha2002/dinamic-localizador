/**
 * Canonical UX labels for workday vacancy/coverage across Absences, Operations and Attendance surfaces.
 * Presentation only — business rules stay on the backend.
 */
export const operationalWorkdaySituationLabels = {
  vacancyPending: "Vacante pendiente de cobertura",
  covered: "Jornada cubierta",
  coveredActive: "Cobertura activa",
  vacancyByAbsence: "Vacante por ausencia",
  workdayCancelled: "Jornada cancelada",
  attendanceDuringAbsence: "Asistencia registrada — revisar",
  noPending: "Sin pendientes",
  impactOnApproval: "Impacto estimado al aprobar",
  coverageStatusUnknown: "No se pudo actualizar el estado de cobertura",
} as const;

export function formatCoveredSituationLabel(coveredByEmployeeName?: string | null): string {
  const trimmed = coveredByEmployeeName?.trim();
  return trimmed
    ? `${operationalWorkdaySituationLabels.covered} · ${trimmed}`
    : operationalWorkdaySituationLabels.covered;
}

export type OperationAbsenceBadgePresentationInput = {
  code: string;
  label: string;
  replacementEmployeeId?: string | null;
};

/** Maps operational absence badge codes to cross-module labels (fallback to server label). */
export function operationAbsenceBadgePresentationLabel(
  badge: OperationAbsenceBadgePresentationInput,
): string {
  switch (badge.code) {
    case "REPLACEMENT_PENDING":
      return operationalWorkdaySituationLabels.vacancyByAbsence;
    case "REPLACED":
      return operationalWorkdaySituationLabels.coveredActive;
    case "OPEN_CONFLICT":
      return "Planificación pendiente";
    case "RESOLVED_CONFLICT":
      return "Planificación resuelta";
    case "ABSENT":
      return "Ausente";
    case "PARTIAL_ABSENCE":
      return "Ausencia parcial";
    default:
      return badge.label;
  }
}
