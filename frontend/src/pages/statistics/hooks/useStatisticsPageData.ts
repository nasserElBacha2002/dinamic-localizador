import { useMemo, useCallback, useState } from "react";
import {
  useStatisticsByEmployee,
  useStatisticsByInventory,
  useStatisticsByLocation,
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
      inventoryId: table.state.inventoryId || undefined,
      storeId: table.state.storeId || undefined,
      employeeId: table.state.employeeId || undefined,
      validationStatus: (table.state.validationStatus as StatisticsValidationStatus) || undefined,
      locationStatus: table.state.locationStatus || undefined,
      punctualityStatus: table.state.punctualityStatus || undefined,
    }),
    [
      isoDateFrom,
      isoDateTo,
      table.state.employeeId,
      table.state.inventoryId,
      table.state.locationStatus,
      table.state.punctualityStatus,
      table.state.storeId,
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

  const inventoryFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.invPage,
      limit: table.state.invPageSize,
      sortBy: table.state.invSortBy,
      sortDirection: table.state.invSortOrder,
    }),
    [baseFilters, table.state.invPage, table.state.invPageSize, table.state.invSortBy, table.state.invSortOrder],
  );

  const inventoryExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: table.state.invSortBy,
      sortDirection: table.state.invSortOrder,
    }),
    [baseFilters, table.state.invSortBy, table.state.invSortOrder],
  );

  const locationFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.locPage,
      limit: table.state.locPageSize,
      sortBy: table.state.locSortBy,
      sortDirection: table.state.locSortOrder,
    }),
    [baseFilters, table.state.locPage, table.state.locPageSize, table.state.locSortBy, table.state.locSortOrder],
  );

  const locationExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: table.state.locSortBy,
      sortDirection: table.state.locSortOrder,
    }),
    [baseFilters, table.state.locSortBy, table.state.locSortOrder],
  );

  const summaryQuery = useStatisticsSummary(baseFilters);
  const timelineQuery = useStatisticsTimeline(baseFilters);
  const distributionQuery = useStatisticsStatusDistribution(baseFilters);
  const employeeQuery = useStatisticsByEmployee(employeeFilters);
  const employeeExportQuery = useStatisticsByEmployee(employeeExportFilters);
  const inventoryQuery = useStatisticsByInventory(inventoryFilters);
  const inventoryExportQuery = useStatisticsByInventory(inventoryExportFilters);
  const locationQuery = useStatisticsByLocation(locationFilters);
  const locationExportQuery = useStatisticsByLocation(locationExportFilters);

  const chartEmployeeData = employeeExportQuery.data?.data ?? [];
  const chartInventoryData = inventoryExportQuery.data?.data ?? [];
  const chartLocationData = locationExportQuery.data?.data ?? [];

  const topEmployeesByAttendance = [...chartEmployeeData]
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
    .slice(0, 10);

  const topLateEmployees = [...chartEmployeeData]
    .sort((a, b) => b.lateCount - a.lateCount)
    .filter((row) => row.lateCount > 0)
    .slice(0, 10);

  const topInventoriesByAttendance = [...chartInventoryData]
    .sort((a, b) => b.attendancePercentage - a.attendancePercentage)
    .slice(0, 10);

  const topLocationsByAttendance = [...chartLocationData]
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
        ["Inventarios", summary.totalInventories],
      ]
    : [];

  const resetAllPages = () => {
    table.setState(
      {
        empPage: 1,
        invPage: 1,
        locPage: 1,
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

  const handleInventorySort = (field: string) => {
    if (table.state.invSortBy === field) {
      table.setState({
        invSortBy: field,
        invSortOrder: table.state.invSortOrder === "asc" ? "desc" : "asc",
        invPage: 1,
      });
      return;
    }

    table.setState({ invSortBy: field, invSortOrder: "desc", invPage: 1 });
  };

  const handleLocationSort = (field: string) => {
    if (table.state.locSortBy === field) {
      table.setState({
        locSortBy: field,
        locSortOrder: table.state.locSortOrder === "asc" ? "desc" : "asc",
        locPage: 1,
      });
      return;
    }

    table.setState({ locSortBy: field, locSortOrder: "desc", locPage: 1 });
  };

  const employeePagination = {
    page: table.state.empPage,
    pageSize: table.state.empPageSize,
    onPageChange: (page: number) => table.setField("empPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ empPageSize: pageSize, empPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("empPage", 1, { resetPage: false }),
  };

  const inventoryPagination = {
    page: table.state.invPage,
    pageSize: table.state.invPageSize,
    onPageChange: (page: number) => table.setField("invPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ invPageSize: pageSize, invPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("invPage", 1, { resetPage: false }),
  };

  const locationPagination = {
    page: table.state.locPage,
    pageSize: table.state.locPageSize,
    onPageChange: (page: number) => table.setField("locPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ locPageSize: pageSize, locPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("locPage", 1, { resetPage: false }),
  };

  return {
    activeTab: table.state.tab,
    setActiveTab: (tab: StatisticsTabKey) => table.setField("tab", tab, { resetPage: false }),
    defaultDateRange,
    dateRange,
    setDateRange: (value: DateRangeValue) => table.setState(dateRangeToUrlFields(value)),
    inventoryId: table.state.inventoryId,
    setInventoryId: (value: string) => table.setField("inventoryId", value),
    storeId: table.state.storeId,
    setStoreId: (value: string) => table.setField("storeId", value),
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
    inventoryQuery,
    inventoryExportQuery,
    locationQuery,
    locationExportQuery,
    employeePagination,
    inventoryPagination,
    locationPagination,
    employeeSortBy: table.state.empSortBy,
    employeeSortDirection: table.state.empSortOrder,
    inventorySortBy: table.state.invSortBy,
    inventorySortDirection: table.state.invSortOrder,
    locationSortBy: table.state.locSortBy,
    locationSortDirection: table.state.locSortOrder,
    handleEmployeeSort,
    handleInventorySort,
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
    topInventoriesByAttendance,
    topLocationsByAttendance,
  };
}

export type StatisticsPageData = ReturnType<typeof useStatisticsPageData>;
