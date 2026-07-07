import type { StatisticsEffectiveState } from "../types/statistics";

export const employeeWorkdayEffectiveStateLabels: Record<StatisticsEffectiveState, string> = {
  PRESENT: "Con asistencia",
  ABSENT: "Ausente",
  JUSTIFIED: "Justificado",
  EXPECTED: "Pendiente / esperada",
  CANCELLED: "Cancelado",
  "": "",
};
