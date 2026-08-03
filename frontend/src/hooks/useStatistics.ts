import { useQuery } from "@tanstack/react-query";
import {
  getAttendanceByEmployee,
  getAttendanceByOperation,
  getAttendanceByService,
  getAttendanceActionExceptions,
  getAttendanceStatisticsSummary,
  getAttendanceStatisticsTimeline,
  getAttendanceStatusDistribution,
  getAttendanceWorkdayDetails,
} from "../api/statistics.api";
import type { StatisticsFilters } from "../types/statistics";
import { statisticsKeys } from "../queryKeys/statistics";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export { statisticsKeys };

type QueryEnableOptions = {
  enabled?: boolean;
};

export function useStatisticsSummary(filters: StatisticsFilters, options?: QueryEnableOptions) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.summary(companyId, filters),
    queryFn: () => getAttendanceStatisticsSummary(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatisticsTimeline(filters: StatisticsFilters, options?: QueryEnableOptions) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.timeline(companyId, filters),
    queryFn: () => getAttendanceStatisticsTimeline(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatisticsActionExceptions(
  filters: StatisticsFilters,
  options?: QueryEnableOptions,
) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.actionExceptions(companyId, filters),
    queryFn: () => getAttendanceActionExceptions(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/** Historical mutually-exclusive status distribution (not action exceptions). */
export function useStatisticsStatusDistribution(
  filters: StatisticsFilters,
  options?: QueryEnableOptions,
) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.statusDistribution(companyId, filters),
    queryFn: () => getAttendanceStatusDistribution(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatisticsByEmployee(filters: StatisticsFilters, options?: QueryEnableOptions) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byEmployee(companyId, filters),
    queryFn: () => getAttendanceByEmployee(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatisticsByOperation(filters: StatisticsFilters, options?: QueryEnableOptions) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byOperation(companyId, filters),
    queryFn: () => getAttendanceByOperation(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatisticsByService(filters: StatisticsFilters, options?: QueryEnableOptions) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byLocation(companyId, filters),
    queryFn: () => getAttendanceByService(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useStatisticsWorkdayDetails(
  filters: StatisticsFilters,
  options?: QueryEnableOptions,
) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.workdayDetails(companyId, filters),
    queryFn: () => getAttendanceWorkdayDetails(filters),
    enabled: enabled && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}
