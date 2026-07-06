import { useMemo, useCallback, useState } from "react";
import {
  useStatisticsByEmployee,
  useStatisticsByOperation,
  useStatisticsByService,
  useStatisticsStatusDistribution,
  useStatisticsSummary,
  useStatisticsTimeline,
} from "../../../hooks/useStatistics";
import { useTableUrlState } from "../../../hooks/useTableUrlState";
import type { StatisticsFilters, StatisticsValidationStatus } from "../../../types/statistics";
import type { StatisticsTabKey } from "../statistics-table-state";
import type { DateRangeValue } from "../../../types/date-range";
import {
  buildStatisticsTableDefaults,
  STATISTICS_TABLE_FIELDS,
} from "../statistics-table-state";
import {
  areDateRangeUrlFieldsEqual,
  dateRangeToUrlFields,
  urlFieldsToDateRange,
} from "../../../utils/date-range-url";
import {
  getDefaultStatisticsDateRange,
  getDateRangeQueryValue,
  isInvalidCustomDateRange,
} from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../../../utils/dates";
import { formatPercent } from "../../../utils/export";
import { terminology } from "../../../domain/terminology";
import {
  buildStatusDistributionOption,
  buildTimelineChartOption,
} from "../../../components/statistics/statistics-chart-options";

export type { StatisticsTabKey } from "../statistics-table-state";

const SUMMARY_HEADERS = ["Métrica", "Valor"];

export function useStatisticsPageData() {
  const [defaultDateRange] = useState<DateRangeValue>(() => getDefaultStatisticsDateRange());
  const defaultDateFields = useMemo(
    () => dateRangeToUrlFields(defaultDateRange),
    [defaultDateRange],
  );
  const tableDefaults = useMemo(
    () => buildStatisticsTableDefaults(defaultDateFields),
    [defaultDateFields],
  );
  const shouldOmitFromUrl = useCallback(
    (
      key: keyof typeof tableDefaults,
      value: (typeof tableDefaults)[keyof typeof tableDefaults],
      defaults: typeof tableDefaults,
      state: typeof tableDefaults,
    ) => {
      if (key === "datePreset" || key === "dateFrom" || key === "dateTo") {
        return areDateRangeUrlFieldsEqual(
          {
            datePreset: String(state.datePreset),
            dateFrom: String(state.dateFrom),
            dateTo: String(state.dateTo),
          },
          defaultDateFields,
        );
      }

      return value === defaults[key] || value === "";
    },
    [defaultDateFields],
  );

  const table = useTableUrlState({
    defaults: tableDefaults,
    fields: STATISTICS_TABLE_FIELDS,
    shouldOmitFromUrl,
  });

  const dateRange = useMemo(
    () =>
      urlFieldsToDateRange({
        datePreset: table.state.datePreset,
        dateFrom: table.state.dateFrom,
        dateTo: table.state.dateTo,
      }),
    [table.state.dateFrom, table.state.datePreset, table.state.dateTo],
  );

  const dateQuery = getDateRangeQueryValue(dateRange);
  const isoDateFrom = dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined;
  const isoDateTo = dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined;
  const exportsDisabled = isInvalidCustomDateRange(dateRange);

  const baseFilters = useMemo<StatisticsFilters>(
    () => ({
      dateFrom: isoDateFrom,
      dateTo: isoDateTo,
      operationId: table.state.operationId || undefined,
      serviceId: table.state.serviceId || undefined,
      employeeId: table.state.employeeId || undefined,
      validationStatus: (table.state.validationStatus as StatisticsValidationStatus) || undefined,
      locationStatus: table.state.locationStatus || undefined,
      punctualityStatus: table.state.punctualityStatus || undefined,
    }),
    [
      isoDateFrom,
      isoDateTo,
      table.state.employeeId,
      table.state.operationId,
      table.state.locationStatus,
      table.state.punctualityStatus,
      table.state.serviceId,
      table.state.validationStatus,
    ],
  );

  const employeeFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.empPage,
      limit: table.state.empPageSize,
      sortBy: table.state.empSortBy,
      sortDirection: table.state.empSortOrder,
    }),
    [baseFilters, table.state.empPage, table.state.empPageSize, table.state.empSortBy, table.state.empSortOrder],
  );

  const employeeExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: table.state.empSortBy,
      sortDirection: table.state.empSortOrder,
    }),
    [baseFilters, table.state.empSortBy, table.state.empSortOrder],
  );

  const operationFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.opPage,
      limit: table.state.opPageSize,
      sortBy: table.state.opSortBy,
      sortDirection: table.state.opSortOrder,
    }),
    [baseFilters, table.state.opPage, table.state.opPageSize, table.state.opSortBy, table.state.opSortOrder],
  );

  const operationExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: table.state.opSortBy,
      sortDirection: table.state.opSortOrder,
    }),
    [baseFilters, table.state.opSortBy, table.state.opSortOrder],
  );

  const serviceFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.svcPage,
      limit: table.state.svcPageSize,
      sortBy: table.state.svcSortBy,
      sortDirection: table.state.svcSortOrder,
    }),
    [baseFilters, table.state.svcPage, table.state.svcPageSize, table.state.svcSortBy, table.state.svcSortOrder],
  );

  const serviceExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: table.state.svcSortBy,
      sortDirection: table.state.svcSortOrder,
    }),
    [baseFilters, table.state.svcSortBy, table.state.svcSortOrder],
  );

  const summaryQuery = useStatisticsSummary(baseFilters);
  const timelineQuery = useStatisticsTimeline(baseFilters);
  const distributionQuery = useStatisticsStatusDistribution(baseFilters);
  const employeeQuery = useStatisticsByEmployee(employeeFilters);
  const employeeExportQuery = useStatisticsByEmployee(employeeExportFilters);
  const operationQuery = useStatisticsByOperation(operationFilters);
  const operationExportQuery = useStatisticsByOperation(operationExportFilters);
  const serviceQuery = useStatisticsByService(serviceFilters);
  const serviceExportQuery = useStatisticsByService(serviceExportFilters);

  const chartEmployeeData = employeeExportQuery.data?.data ?? [];
  const chartOperationData = operationExportQuery.data?.data ?? [];
  const chartServiceData = serviceExportQuery.data?.data ?? [];

  const topEmployeesByAttendance = [...chartEmployeeData]
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
    .slice(0, 10);

  const topLateEmployees = [...chartEmployeeData]
    .sort((a, b) => b.lateCount - a.lateCount)
    .filter((row) => row.lateCount > 0)
    .slice(0, 10);

  const topOperationsByAttendance = [...chartOperationData]
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
    .slice(0, 10);

  const topServicesByAttendance = [...chartServiceData]
    .sort((a, b) => b.averageAttendancePercentage - a.averageAttendancePercentage)
    .slice(0, 10);

  const timeline = timelineQuery.data ?? [];
  const timelineOption = buildTimelineChartOption(
    timeline.map((point) => point.date),
    {
      present: timeline.map((point) => point.present),
      late: timeline.map((point) => point.late),
      outsideGeofence: timeline.map((point) => point.outsideGeofence),
      pendingReview: timeline.map((point) => point.pendingReview),
      rejected: timeline.map((point) => point.rejected),
    },
  );

  const timelineExportRows = timeline.map((point) => [
    point.date,
    point.present,
    point.late,
    point.outsideGeofence,
    point.pendingReview,
    point.rejected,
    point.noShow,
    point.total,
  ]);

  const distribution = distributionQuery.data ?? [];
  const distributionOption = buildStatusDistributionOption(distribution);

  const summary = summaryQuery.data;
  const summaryExportRows = summary
    ? [
        ["Registros de asistencia", summary.totalAttendanceRecords],
        ["Empleados asignados", summary.totalAssignedEmployees],
        ["% asistencia", formatPercent(summary.attendancePercentage)],
        ["Presente / a tiempo", summary.presentCount],
        ["Tarde", summary.lateCount],
        ["Fuera de geocerca", summary.outsideGeofenceCount],
        ["Pendiente de revisión", summary.pendingReviewCount],
        ["Rechazados", summary.rejectedCount],
        ["Aceptados manualmente", summary.manuallyAcceptedCount],
        ["Sin asistencia", summary.noShowCount],
        [terminology.operation.plural, summary.totalOperations],
      ]
    : [];

  const resetAllPages = () => {
    table.setState(
      {
        empPage: 1,
        opPage: 1,
        svcPage: 1,
      },
      { resetPage: false },
    );
  };

  const handleEmployeeSort = (field: string) => {
    if (table.state.empSortBy === field) {
      table.setState({
        empSortBy: field,
        empSortOrder: table.state.empSortOrder === "asc" ? "desc" : "asc",
        empPage: 1,
      });
      return;
    }

    table.setState({ empSortBy: field, empSortOrder: "desc", empPage: 1 });
  };

  const handleOperationSort = (field: string) => {
    if (table.state.opSortBy === field) {
      table.setState({
        opSortBy: field,
        opSortOrder: table.state.opSortOrder === "asc" ? "desc" : "asc",
        opPage: 1,
      });
      return;
    }

    table.setState({ opSortBy: field, opSortOrder: "desc", opPage: 1 });
  };

  const handleLocationSort = (field: string) => {
    if (table.state.svcSortBy === field) {
      table.setState({
        svcSortBy: field,
        svcSortOrder: table.state.svcSortOrder === "asc" ? "desc" : "asc",
        svcPage: 1,
      });
      return;
    }

    table.setState({ svcSortBy: field, svcSortOrder: "desc", svcPage: 1 });
  };

  const employeePagination = {
    page: table.state.empPage,
    pageSize: table.state.empPageSize,
    onPageChange: (page: number) => table.setField("empPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ empPageSize: pageSize, empPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("empPage", 1, { resetPage: false }),
  };

  const operationPagination = {
    page: table.state.opPage,
    pageSize: table.state.opPageSize,
    onPageChange: (page: number) => table.setField("opPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ opPageSize: pageSize, opPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("opPage", 1, { resetPage: false }),
  };

  const servicePagination = {
    page: table.state.svcPage,
    pageSize: table.state.svcPageSize,
    onPageChange: (page: number) => table.setField("svcPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ svcPageSize: pageSize, svcPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("svcPage", 1, { resetPage: false }),
  };

  return {
    activeTab: table.state.tab,
    setActiveTab: (tab: StatisticsTabKey) => table.setField("tab", tab, { resetPage: false }),
    defaultDateRange,
    dateRange,
    setDateRange: (value: DateRangeValue) => table.setState(dateRangeToUrlFields(value)),
    operationId: table.state.operationId,
    setOperationId: (value: string) => table.setField("operationId", value),
    serviceId: table.state.serviceId,
    setServiceId: (value: string) => table.setField("serviceId", value),
    employeeId: table.state.employeeId,
    setEmployeeId: (value: string) => table.setField("employeeId", value),
    validationStatus: table.state.validationStatus as StatisticsValidationStatus,
    setValidationStatus: (value: string) => table.setField("validationStatus", value),
    locationStatus: table.state.locationStatus,
    setLocationStatus: (value: string) => table.setField("locationStatus", value),
    punctualityStatus: table.state.punctualityStatus,
    setPunctualityStatus: (value: string) => table.setField("punctualityStatus", value),
    exportsDisabled,
    isoDateFrom,
    isoDateTo,
    resetAllPages,
    summaryQuery,
    timelineQuery,
    distributionQuery,
    employeeQuery,
    employeeExportQuery,
    operationQuery,
    operationExportQuery,
    serviceQuery,
    serviceExportQuery,
    employeePagination,
    operationPagination,
    servicePagination,
    employeeSortBy: table.state.empSortBy,
    employeeSortDirection: table.state.empSortOrder,
    operationSortBy: table.state.opSortBy,
    operationSortDirection: table.state.opSortOrder,
    serviceSortBy: table.state.svcSortBy,
    serviceSortDirection: table.state.svcSortOrder,
    handleEmployeeSort,
    handleOperationSort,
    handleLocationSort,
    summaryHeaders: SUMMARY_HEADERS,
    summary,
    summaryExportRows,
    timeline,
    timelineOption,
    timelineExportRows,
    distribution,
    distributionOption,
    topEmployeesByAttendance,
    topLateEmployees,
    topOperationsByAttendance,
    topServicesByAttendance,
  };
}

export type StatisticsPageData = ReturnType<typeof useStatisticsPageData>;
