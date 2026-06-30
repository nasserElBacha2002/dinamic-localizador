import { useMemo, useState } from "react";
import {
  useStatisticsByEmployee,
  useStatisticsByInventory,
  useStatisticsByLocation,
  useStatisticsStatusDistribution,
  useStatisticsSummary,
  useStatisticsTimeline,
} from "../../../hooks/useStatistics";
import { usePaginationState } from "../../../hooks/usePaginationState";
import type { StatisticsFilters, StatisticsValidationStatus } from "../../../types/statistics";
import type { DateRangeValue } from "../../../types/date-range";
import { getDefaultStatisticsDateRange, getDateRangeQueryValue, isInvalidCustomDateRange } from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../../../utils/dates";
import { formatPercent } from "../../../utils/export";
import {
  buildStatusDistributionOption,
  buildTimelineChartOption,
} from "../../../components/statistics/statistics-chart-options";

export type StatisticsTabKey = "general" | "employee" | "inventory" | "location";

const SUMMARY_HEADERS = ["Métrica", "Valor"];

export function useStatisticsPageData() {
  const [activeTab, setActiveTab] = useState<StatisticsTabKey>("general");
  const [defaultDateRange] = useState<DateRangeValue>(() => getDefaultStatisticsDateRange());
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => defaultDateRange);
  const [inventoryId, setInventoryId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [validationStatus, setValidationStatus] = useState<StatisticsValidationStatus>("");
  const [locationStatus, setLocationStatus] = useState("");
  const [punctualityStatus, setPunctualityStatus] = useState("");

  const employeePagination = usePaginationState(10);
  const inventoryPagination = usePaginationState(10);
  const locationPagination = usePaginationState(10);

  const [employeeSortBy, setEmployeeSortBy] = useState("attendancePercentage");
  const [employeeSortDirection, setEmployeeSortDirection] = useState<"asc" | "desc">("desc");
  const [inventorySortBy, setInventorySortBy] = useState("scheduledStart");
  const [inventorySortDirection, setInventorySortDirection] = useState<"asc" | "desc">("desc");
  const [locationSortBy, setLocationSortBy] = useState("averageAttendancePercentage");
  const [locationSortDirection, setLocationSortDirection] = useState<"asc" | "desc">("desc");

  const dateQuery = getDateRangeQueryValue(dateRange);
  const isoDateFrom = dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined;
  const isoDateTo = dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined;
  const exportsDisabled = isInvalidCustomDateRange(dateRange);

  const baseFilters = useMemo<StatisticsFilters>(
    () => ({
      dateFrom: isoDateFrom,
      dateTo: isoDateTo,
      inventoryId: inventoryId || undefined,
      storeId: storeId || undefined,
      employeeId: employeeId || undefined,
      validationStatus: validationStatus || undefined,
      locationStatus: locationStatus || undefined,
      punctualityStatus: punctualityStatus || undefined,
    }),
    [
      isoDateFrom,
      isoDateTo,
      inventoryId,
      storeId,
      employeeId,
      validationStatus,
      locationStatus,
      punctualityStatus,
    ],
  );

  const summaryQuery = useStatisticsSummary(baseFilters);
  const timelineQuery = useStatisticsTimeline(baseFilters);
  const distributionQuery = useStatisticsStatusDistribution(baseFilters);

  const employeeFilters = useMemo(
    () => ({
      ...baseFilters,
      page: employeePagination.page,
      limit: employeePagination.pageSize,
      sortBy: employeeSortBy,
      sortDirection: employeeSortDirection,
    }),
    [baseFilters, employeePagination.page, employeePagination.pageSize, employeeSortBy, employeeSortDirection],
  );

  const employeeExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: employeeSortBy,
      sortDirection: employeeSortDirection,
    }),
    [baseFilters, employeeSortBy, employeeSortDirection],
  );

  const inventoryFilters = useMemo(
    () => ({
      ...baseFilters,
      page: inventoryPagination.page,
      limit: inventoryPagination.pageSize,
      sortBy: inventorySortBy,
      sortDirection: inventorySortDirection,
    }),
    [baseFilters, inventoryPagination.page, inventoryPagination.pageSize, inventorySortBy, inventorySortDirection],
  );

  const inventoryExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: inventorySortBy,
      sortDirection: inventorySortDirection,
    }),
    [baseFilters, inventorySortBy, inventorySortDirection],
  );

  const locationFilters = useMemo(
    () => ({
      ...baseFilters,
      page: locationPagination.page,
      limit: locationPagination.pageSize,
      sortBy: locationSortBy,
      sortDirection: locationSortDirection,
    }),
    [baseFilters, locationPagination.page, locationPagination.pageSize, locationSortBy, locationSortDirection],
  );

  const locationExportFilters = useMemo(
    () => ({
      ...baseFilters,
      export: true,
      sortBy: locationSortBy,
      sortDirection: locationSortDirection,
    }),
    [baseFilters, locationSortBy, locationSortDirection],
  );

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
    employeePagination.resetPage();
    inventoryPagination.resetPage();
    locationPagination.resetPage();
  };

  const handleEmployeeSort = (field: string) => {
    employeePagination.resetPage();
    if (employeeSortBy === field) {
      setEmployeeSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setEmployeeSortBy(field);
    setEmployeeSortDirection("desc");
  };

  const handleInventorySort = (field: string) => {
    inventoryPagination.resetPage();
    if (inventorySortBy === field) {
      setInventorySortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setInventorySortBy(field);
    setInventorySortDirection("desc");
  };

  const handleLocationSort = (field: string) => {
    locationPagination.resetPage();
    if (locationSortBy === field) {
      setLocationSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setLocationSortBy(field);
    setLocationSortDirection("desc");
  };

  return {
    activeTab,
    setActiveTab,
    defaultDateRange,
    dateRange,
    setDateRange,
    inventoryId,
    setInventoryId,
    storeId,
    setStoreId,
    employeeId,
    setEmployeeId,
    validationStatus,
    setValidationStatus,
    locationStatus,
    setLocationStatus,
    punctualityStatus,
    setPunctualityStatus,
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
    employeeSortBy,
    employeeSortDirection,
    inventorySortBy,
    inventorySortDirection,
    locationSortBy,
    locationSortDirection,
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
