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
import { companyApiPath } from "./company-path";

function toParams(filters: StatisticsFilters): Record<string, string | number | boolean | undefined> {
  return buildParams(filters as Record<string, string | number | boolean | undefined>);
}

export async function getAttendanceStatisticsSummary(
  filters: StatisticsFilters,
  companyId?: string,
): Promise<AttendanceStatisticsSummary> {
  const { data } = await apiClient.get<SingleResponse<AttendanceStatisticsSummary>>(
    companyApiPath("statistics/attendance/summary", companyId),
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceStatisticsTimeline(
  filters: StatisticsFilters,
  companyId?: string,
): Promise<AttendanceTimelinePoint[]> {
  const { data } = await apiClient.get<{ data: AttendanceTimelinePoint[] }>(
    companyApiPath("statistics/attendance/timeline", companyId),
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceStatusDistribution(
  filters: StatisticsFilters,
  companyId?: string,
): Promise<AttendanceStatusDistributionItem[]> {
  const { data } = await apiClient.get<{ data: AttendanceStatusDistributionItem[] }>(
    companyApiPath("statistics/attendance/status-distribution", companyId),
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceByEmployee(
  filters: StatisticsFilters,
  companyId?: string,
): Promise<PaginatedResponse<AttendanceByEmployeeRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceByEmployeeRow>>(
    companyApiPath("statistics/attendance/by-employee", companyId),
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceByInventory(
  filters: StatisticsFilters,
  companyId?: string,
): Promise<PaginatedResponse<AttendanceByInventoryRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceByInventoryRow>>(
    companyApiPath("statistics/attendance/by-inventory", companyId),
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceByLocation(
  filters: StatisticsFilters,
  companyId?: string,
): Promise<PaginatedResponse<AttendanceByLocationRow>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceByLocationRow>>(
    companyApiPath("statistics/attendance/by-location", companyId),
    { params: toParams(filters) },
  );
  return data;
}
