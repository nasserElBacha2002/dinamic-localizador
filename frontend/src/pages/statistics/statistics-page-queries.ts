import type { StatisticsFilters } from "../../types/statistics";

export const CHART_TOP_LIMIT = 10;

export const buildTopEmployeesByAttendanceFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "attendanceRate",
  sortDirection: "desc",
});

export const buildTopLateEmployeesFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "lateWorkdays",
  sortDirection: "desc",
});

export const buildTopOperationsByAttendanceFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "attendanceRate",
  sortDirection: "desc",
});

export const buildTopServicesByAttendanceFilters = (
  baseFilters: StatisticsFilters,
): StatisticsFilters => ({
  ...baseFilters,
  page: 1,
  limit: CHART_TOP_LIMIT,
  sortBy: "attendanceRate",
  sortDirection: "desc",
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
