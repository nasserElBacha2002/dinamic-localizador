import { useMemo } from "react";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useOperations } from "../../hooks/useOperations";
import {
  useStatisticsByEmployee,
  useStatisticsByOperation,
  useStatisticsIncidentDetails,
  useStatisticsSummary,
  useStatisticsWorkdayDetails,
} from "../../hooks/useStatistics";
import {
  buildAttentionEmployeesFilters,
  buildLowCoverageOperationsFilters,
} from "../statistics/statistics-page-queries";
import { canAccessModuleRoute } from "../../utils/company-modules";
import { formatDateRangeDisplay } from "../../utils/date-range";
import { getApiErrorMessage } from "../../utils/errors";
import { hasAnyPermission } from "../../utils/permissions";
import {
  buildHomeStatisticsFilters,
  buildHomeStatisticsLinkContext,
  buildHomeStatisticsPageHref,
  buildHomeTodayOperationsFilters,
  buildDateRangeListHref,
  resolveHomeTodayIsoRange,
} from "./home-dashboard";
import {
  buildHomeAttentionViewModel,
  HOME_ATTENTION_INCIDENT_LIMIT,
} from "./home-dashboard-attention";
import {
  computeAttentionLoading,
  deriveShouldLoadIncidentDetails,
  deriveShouldLoadLowCoverage,
  resolveHomeAttentionPanelState,
} from "./home-dashboard-attention-state";

export function useHomeDashboard() {
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
  const permissions = permissionsQuery.data?.permissions;
  const modules = modulesQuery.data;

  const today = useMemo(() => resolveHomeTodayIsoRange(), []);

  const canReadOperations = hasAnyPermission(permissions, [
    "operations:read",
    "operations:manage",
  ]);
  const canAccessReports = canAccessModuleRoute(modules, permissions, "reports");

  const statisticsFilters = useMemo(
    () =>
      today
        ? buildHomeStatisticsFilters(today.isoDateFrom, today.isoDateTo)
        : undefined,
    [today],
  );

  const linkContext = useMemo(
    () =>
      today
        ? buildHomeStatisticsLinkContext(today.isoDateFrom, today.isoDateTo)
        : {},
    [today],
  );

  const operationsFilters = useMemo(
    () =>
      today
        ? buildHomeTodayOperationsFilters(today.isoDateFrom, today.isoDateTo)
        : undefined,
    [today],
  );

  const reportsEnabled = canAccessReports && Boolean(statisticsFilters);

  const summaryQuery = useStatisticsSummary(statisticsFilters ?? {}, {
    enabled: reportsEnabled,
  });

  const unavailableFilters = useMemo(
    () =>
      statisticsFilters
        ? {
            ...statisticsFilters,
            confirmationStatus: "UNAVAILABLE" as const,
            page: 1,
            limit: 1,
          }
        : undefined,
    [statisticsFilters],
  );

  const unavailableWorkdaysQuery = useStatisticsWorkdayDetails(unavailableFilters ?? {}, {
    enabled: reportsEnabled,
  });

  const lowCoverageFilters = useMemo(
    () =>
      statisticsFilters ? buildLowCoverageOperationsFilters(statisticsFilters) : undefined,
    [statisticsFilters],
  );

  const shouldLoadLowCoverage = deriveShouldLoadLowCoverage(
    summaryQuery.data,
    summaryQuery.isSuccess,
  );

  const lowCoverageQuery = useStatisticsByOperation(lowCoverageFilters ?? {}, {
    enabled: reportsEnabled && Boolean(lowCoverageFilters) && shouldLoadLowCoverage,
  });

  const todayOperationsQuery = useOperations(
    operationsFilters ?? {},
    canReadOperations && Boolean(operationsFilters),
  );

  const attentionEmployeesFilters = useMemo(
    () =>
      statisticsFilters ? buildAttentionEmployeesFilters(statisticsFilters) : undefined,
    [statisticsFilters],
  );

  const attentionEmployeesQuery = useStatisticsByEmployee(attentionEmployeesFilters ?? {}, {
    enabled: reportsEnabled,
  });

  const incidentDetailsFilters = useMemo(
    () =>
      statisticsFilters
        ? {
            ...statisticsFilters,
            page: 1,
            limit: HOME_ATTENTION_INCIDENT_LIMIT,
          }
        : undefined,
    [statisticsFilters],
  );

  const shouldLoadIncidentDetails = deriveShouldLoadIncidentDetails(
    summaryQuery.data,
    summaryQuery.isSuccess,
  );

  const incidentDetailsQuery = useStatisticsIncidentDetails(incidentDetailsFilters ?? {}, {
    enabled: reportsEnabled && Boolean(incidentDetailsFilters) && shouldLoadIncidentDetails,
  });

  const attentionLoading = computeAttentionLoading({
    summaryLoading: reportsEnabled && summaryQuery.isLoading,
    unavailableLoading: reportsEnabled && unavailableWorkdaysQuery.isLoading,
    attentionEmployeesLoading: reportsEnabled && attentionEmployeesQuery.isLoading,
    lowCoverageLoading: shouldLoadLowCoverage && lowCoverageQuery.isLoading,
    incidentDetailsLoading: shouldLoadIncidentDetails && incidentDetailsQuery.isLoading,
  });

  const sourceErrors = useMemo(() => {
    const errors: string[] = [];
    if (unavailableWorkdaysQuery.isError) {
      errors.push(getApiErrorMessage(unavailableWorkdaysQuery.error));
    }
    if (attentionEmployeesQuery.isError) {
      errors.push(getApiErrorMessage(attentionEmployeesQuery.error));
    }
    if (shouldLoadLowCoverage && lowCoverageQuery.isError) {
      errors.push(getApiErrorMessage(lowCoverageQuery.error));
    }
    if (shouldLoadIncidentDetails && incidentDetailsQuery.isError) {
      errors.push(getApiErrorMessage(incidentDetailsQuery.error));
    }
    return errors;
  }, [
    unavailableWorkdaysQuery.isError,
    unavailableWorkdaysQuery.error,
    attentionEmployeesQuery.isError,
    attentionEmployeesQuery.error,
    shouldLoadLowCoverage,
    lowCoverageQuery.isError,
    lowCoverageQuery.error,
    shouldLoadIncidentDetails,
    incidentDetailsQuery.isError,
    incidentDetailsQuery.error,
  ]);

  const attentionModel = useMemo(() => {
    if (!summaryQuery.isSuccess) {
      return null;
    }

    return buildHomeAttentionViewModel({
      summary: summaryQuery.data,
      unavailableWorkdays: unavailableWorkdaysQuery.isSuccess
        ? unavailableWorkdaysQuery.data?.meta.total
        : undefined,
      lowCoverageOperations:
        shouldLoadLowCoverage && lowCoverageQuery.isSuccess
          ? (lowCoverageQuery.data?.data ?? [])
          : [],
      incidentDetails:
        shouldLoadIncidentDetails && incidentDetailsQuery.isSuccess
          ? (incidentDetailsQuery.data?.data ?? [])
          : [],
      incidentDetailsTotal: incidentDetailsQuery.isSuccess
        ? incidentDetailsQuery.data?.meta.total
        : undefined,
      attentionEmployees: attentionEmployeesQuery.isSuccess
        ? (attentionEmployeesQuery.data?.data ?? [])
        : [],
      attentionEmployeesTotal: attentionEmployeesQuery.isSuccess
        ? attentionEmployeesQuery.data?.meta.total
        : undefined,
      linkContext,
    });
  }, [
    summaryQuery.isSuccess,
    summaryQuery.data,
    unavailableWorkdaysQuery.isSuccess,
    unavailableWorkdaysQuery.data,
    shouldLoadLowCoverage,
    lowCoverageQuery.isSuccess,
    lowCoverageQuery.data,
    shouldLoadIncidentDetails,
    incidentDetailsQuery.isSuccess,
    incidentDetailsQuery.data,
    attentionEmployeesQuery.isSuccess,
    attentionEmployeesQuery.data,
    linkContext,
  ]);

  const attentionPanelState = useMemo(
    () =>
      resolveHomeAttentionPanelState({
        loading: attentionLoading,
        summaryErrorMessage: summaryQuery.isError
          ? getApiErrorMessage(summaryQuery.error)
          : undefined,
        sourceErrors,
        model: attentionModel,
      }),
    [attentionLoading, summaryQuery.isError, summaryQuery.error, sourceErrors, attentionModel],
  );

  const lowCoverageOperationIds = useMemo(() => {
    if (!shouldLoadLowCoverage || !lowCoverageQuery.isSuccess) {
      return new Set<string>();
    }
    return new Set((lowCoverageQuery.data?.data ?? []).map((row) => row.operationId));
  }, [shouldLoadLowCoverage, lowCoverageQuery.isSuccess, lowCoverageQuery.data]);

  const showOperationalContent = canReadOperations || canAccessReports;
  const todayLabel = today ? formatDateRangeDisplay(today.dateRange) : "Hoy";

  return {
    today,
    todayLabel,
    canReadOperations,
    canAccessReports,
    showOperationalContent,
    linkContext,
    summary: summaryQuery.data,
    summaryQuery,
    unavailableWorkdays: unavailableWorkdaysQuery.isSuccess
      ? unavailableWorkdaysQuery.data?.meta.total
      : undefined,
    unavailableWorkdaysQuery,
    lowCoverageOperations: lowCoverageQuery.data?.data ?? [],
    lowCoverageQuery,
    shouldLoadLowCoverage,
    shouldLoadIncidentDetails,
    todayOperationsQuery,
    operationsTotal: todayOperationsQuery.data?.meta.total,
    statisticsPageHref: today ? buildHomeStatisticsPageHref(today.dateRange) : "/statistics",
    operationsListHref: today ? buildDateRangeListHref("/operations", today.dateRange) : "/operations",
    attentionPanelState,
    attentionLoading,
    attentionEmployeesQuery,
    incidentDetailsQuery,
    lowCoverageOperationIds,
  };
}
