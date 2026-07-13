import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AttendanceByEmployeeRow,
  AttendanceByOperationRow,
  AttendanceByServiceRow,
  AttendanceStatisticsSummary,
  AttendanceStatusDistributionItem,
  AttendanceTimelinePoint,
  AttendanceWorkdayDetailRow,
  StatisticsFilters,
} from "../types/statistics";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

function toParams(filters: StatisticsFilters): Record<string, string | number | boolean | undefined> {
  return buildParams(filters as Record<string, string | number | boolean | undefined>);
}

export async function getAttendanceStatisticsSummary(
  filters: StatisticsFilters,
): Promise<AttendanceStatisticsSummary> {
  const { data } = await scopedApiClient.get<SingleResponse<AttendanceStatisticsSummary>>(
    "statistics/attendance/summary",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceStatisticsTimeline(
  filters: StatisticsFilters,
): Promise<AttendanceTimelinePoint[]> {
  const { data } = await scopedApiClient.get<{ data: AttendanceTimelinePoint[] }>(
    "statistics/attendance/timeline",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceStatusDistribution(
  filters: StatisticsFilters,
): Promise<AttendanceStatusDistributionItem[]> {
  const { data } = await scopedApiClient.get<{ data: AttendanceStatusDistributionItem[] }>(
    "statistics/attendance/status-distribution",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function getAttendanceByEmployee(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceByEmployeeRow>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AttendanceByEmployeeRow>>(
    "statistics/attendance/by-employee",
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceByOperation(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceByOperationRow>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AttendanceByOperationRow>>(
    "statistics/attendance/by-operation",
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceByService(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceByServiceRow>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AttendanceByServiceRow>>(
    "statistics/attendance/by-service",
    { params: toParams(filters) },
  );
  return data;
}

export async function getAttendanceWorkdayDetails(
  filters: StatisticsFilters,
): Promise<PaginatedResponse<AttendanceWorkdayDetailRow>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AttendanceWorkdayDetailRow>>(
    "statistics/attendance/workday-details",
    { params: toParams(filters) },
  );
  return data;
}
