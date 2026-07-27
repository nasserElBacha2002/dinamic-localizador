import { useQuery } from "@tanstack/react-query";
import {
  getAttendanceByEmployee,
  getAttendanceByOperation,
  getAttendanceByService,
  getAttendanceStatisticsSummary,
  getAttendanceStatisticsTimeline,
  getAttendanceStatusDistribution,
  getAttendanceWorkdayDetails,
} from "../api/statistics.api";
import type { StatisticsFilters } from "../types/statistics";
import { statisticsKeys } from "../queryKeys/statistics";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export { statisticsKeys };

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

export function useStatisticsByOperation(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byOperation(companyId, filters),
    queryFn: () => getAttendanceByOperation(filters),
    enabled,
  });
}

export function useStatisticsByService(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.byLocation(companyId, filters),
    queryFn: () => getAttendanceByService(filters),
    enabled,
  });
}

export function useStatisticsWorkdayDetails(filters: StatisticsFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: statisticsKeys.workdayDetails(companyId, filters),
    queryFn: () => getAttendanceWorkdayDetails(filters),
    enabled,
  });
}
