import type { StatisticsFilters } from "../schemas/statistics.schema";
import type { DerivedEmployeeWorkdayState } from "../types/employee-workday-state";

export const normalizeStatisticsFilters = (filters: StatisticsFilters): StatisticsFilters => {
  if (filters.validationStatus !== "NO_CHECK_IN") {
    return filters;
  }

  if (filters.effectiveState) {
    const { validationStatus: _deprecated, ...rest } = filters;
    return rest;
  }

  const { validationStatus: _deprecated, ...rest } = filters;
  return {
    ...rest,
    effectiveState: "ABSENT",
  };
};

export const EFFECTIVE_STATE_LABELS: Record<DerivedEmployeeWorkdayState, string> = {
  PRESENT: "Con asistencia",
  ABSENT: "Ausente",
  JUSTIFIED: "Justificado",
  EXPECTED: "Pendiente / esperada",
  CANCELLED: "Cancelado",
};
