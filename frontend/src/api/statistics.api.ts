import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AttendanceByEmployeeRow,
  AttendanceByInventoryRow,
  AttendanceByLocationRow,
  AttendanceStatisticsSummary,
  AttendanceStatusDistributionItem,
  AttendanceTimelinePoint,
  StatisticsFilters,
} from "../types/statistics";
import { apiClient, buildParams } from "./client";

function toParams(filters: StatisticsFilters): Record<string, string | number | boolean | undefined> {
  return buildParams(filters as Record<string, string | number | boolean | undefined>);
}

export async function getAttendanceStatisticsSummary(
  filters: StatisticsFilters,
): Promise<AttendanceStatisticsSummary> {
  const { data } = await apiClient.get<SingleResponse<AttendanceStatisticsSummary>>(
    "/statistics/attendance/summary",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceStatisticsTimeline(
  filters: StatisticsFilters,
): Promise<AttendanceTimelinePoint[]> {
  const { data } = await apiClient.get<{ data: AttendanceTimelinePoint[] }>(
    "/statistics/attendance/timeline",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceStatusDistribution(
  filters: StatisticsFilters,
): Promise<AttendanceStatusDistributionItem[]> {
  const { data } = await apiClient.get<{ data: AttendanceStatusDistributionItem[] }>(
    "/statistics/attendance/status-distribution",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceByEmployee(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceByEmployeeRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceByEmployeeRow>>(
    "/statistics/attendance/by-employee",
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceByInventory(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceByInventoryRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceByInventoryRow>>(
    "/statistics/attendance/by-inventory",
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceByLocation(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceByLocationRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceByLocationRow>>(
    "/statistics/attendance/by-location",
    { params: toParams(filters) },
  );
  return data;
}
