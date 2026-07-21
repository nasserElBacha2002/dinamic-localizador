import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";

export const buildDeactivationSummaryMessage = (
  impact: Pick<
    EmployeeDeactivationImpact,
    "affectedAssignmentsCount" | "affectedWorkdaysCount"
  >,
): string => {
  const assignments = impact.affectedAssignmentsCount;
  const workdays = impact.affectedWorkdaysCount;
  const historyNote =
    "Las operaciones ya finalizadas y el historial de asistencia no serán modificados.";

  if (assignments === 0 && workdays === 0) {
    return `No hay asignaciones activas o futuras para desasignar. ${historyNote}`;
  }

  const assignmentLabel = assignments === 1 ? "asignación" : "asignaciones";
  const workdayLabel = workdays === 1 ? "jornada futura" : "jornadas futuras";

  return `Se quitarán ${workdays} ${workdayLabel} correspondientes a ${assignments} ${assignmentLabel}. ${historyNote}`;
};
