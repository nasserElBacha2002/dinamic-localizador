import { useQuery } from "@tanstack/react-query";
import {
  getAttendanceByEmployee,
  getAttendanceByInventory,
  getAttendanceByLocation,
  getAttendanceStatisticsSummary,
  getAttendanceStatisticsTimeline,
  getAttendanceStatusDistribution,
} from "../api/statistics.api";
import type { StatisticsFilters } from "../types/statistics";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

const statisticsKeys = {
  all: ["statistics"] as const,
  summary: (companyId: string | undefined, filters: StatisticsFilters) =>
    [...statisticsKeys.all, companyId, "summary", filters] as const,
  timeline: (companyId: string | undefined, filters: StatisticsFilters) =>
    [...statisticsKeys.all, companyId, "timeline", filters] as const,
  statusDistribution: (companyId: string | undefined, filters: StatisticsFilters) =>
    [...statisticsKeys.all, companyId, "status-distribution", filters] as const,
  byEmployee: (companyId: string | undefined, filters: StatisticsFilters) =>
    [...statisticsKeys.all, companyId, "by-employee", filters] as const,
  byInventory: (companyId: string | undefined, filters: StatisticsFilters) =>
    [...statisticsKeys.all, companyId, "by-inventory", filters] as const,
  byLocation: (companyId: string | undefined, filters: StatisticsFilters) =>
    [...statisticsKeys.all, companyId, "by-location", filters] as const,
};

export function useStatisticsSummary(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.summary(companyId, filters),
    queryFn: () => getAttendanceStatisticsSummary(filters),
    enabled,
  });
}

export function useStatisticsTimeline(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.timeline(companyId, filters),
    queryFn: () => getAttendanceStatisticsTimeline(filters),
    enabled,
  });
}

export function useStatisticsStatusDistribution(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.statusDistribution(companyId, filters),
    queryFn: () => getAttendanceStatusDistribution(filters),
    enabled,
  });
}

export function useStatisticsByEmployee(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byEmployee(companyId, filters),
    queryFn: () => getAttendanceByEmployee(filters),
    enabled,
  });
}

export function useStatisticsByInventory(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byInventory(companyId, filters),
    queryFn: () => getAttendanceByInventory(filters),
    enabled,
  });
}

export function useStatisticsByLocation(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byLocation(companyId, filters),
    queryFn: () => getAttendanceByLocation(filters),
    enabled,
  });
}
