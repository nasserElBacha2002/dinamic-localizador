import type { StatisticsFilters } from "../../types/statistics";

export const CHART_TOP_LIMIT = 10;

export const buildAttentionEmployeesFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "incidentCount",
  sortDirection: "desc",
  rankingMode: "attention_employees",
});

export const buildTopLateEmployeesFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "lateWorkdays",
  sortDirection: "desc",
  rankingMode: "late_employees",
});

export const buildLowCoverageOperationsFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "coverageRate",
  sortDirection: "asc",
  rankingMode: "low_coverage_operations",
});

export const buildIncidentServicesFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "incidentCount",
  sortDirection: "desc",
  rankingMode: "incident_services",
});

export const buildEmployeeTableExportFilters = (
  baseFilters: StatisticsFilters,
  sortBy: string,
  sortDirection: "asc" | "desc",
): StatisticsFilters => ({
  ...baseFilters,
  export: true,
  sortBy,
  sortDirection,
});

export const buildOperationTableExportFilters = (
  baseFilters: StatisticsFilters,
  sortBy: string,
  sortDirection: "asc" | "desc",
): StatisticsFilters => ({
  ...baseFilters,
  export: true,
  sortBy,
  sortDirection,
});

export const buildServiceTableExportFilters = (
  baseFilters: StatisticsFilters,
  sortBy: string,
  sortDirection: "asc" | "desc",
): StatisticsFilters => ({
  ...baseFilters,
  export: true,
  sortBy,
  sortDirection,
});

export const buildWorkdayDetailExportFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  export: true,
});
