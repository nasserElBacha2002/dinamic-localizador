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

const statisticsKeys = {
  all: ["statistics"] as const,
  summary: (filters: StatisticsFilters) => [...statisticsKeys.all, "summary", filters] as const,
  timeline: (filters: StatisticsFilters) => [...statisticsKeys.all, "timeline", filters] as const,
  statusDistribution: (filters: StatisticsFilters) =>
    [...statisticsKeys.all, "status-distribution", filters] as const,
  byEmployee: (filters: StatisticsFilters) => [...statisticsKeys.all, "by-employee", filters] as const,
  byInventory: (filters: StatisticsFilters) => [...statisticsKeys.all, "by-inventory", filters] as const,
  byLocation: (filters: StatisticsFilters) => [...statisticsKeys.all, "by-location", filters] as const,
};

export function useStatisticsSummary(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.summary(filters),
    queryFn: () => getAttendanceStatisticsSummary(filters),
  });
}

export function useStatisticsTimeline(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.timeline(filters),
    queryFn: () => getAttendanceStatisticsTimeline(filters),
  });
}

export function useStatisticsStatusDistribution(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.statusDistribution(filters),
    queryFn: () => getAttendanceStatusDistribution(filters),
  });
}

export function useStatisticsByEmployee(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.byEmployee(filters),
    queryFn: () => getAttendanceByEmployee(filters),
  });
}

export function useStatisticsByInventory(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.byInventory(filters),
    queryFn: () => getAttendanceByInventory(filters),
  });
}

export function useStatisticsByLocation(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.byLocation(filters),
    queryFn: () => getAttendanceByLocation(filters),
  });
}
