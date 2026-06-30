import { Box, Grid, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import { ErrorState } from "../../components/common/ErrorState";
import { PageHeader } from "../../components/common/PageHeader";
import { ChartCard } from "../../components/statistics/ChartCard";
import { ExportActionButtons } from "../../components/statistics/ExportActionButtons";
import { StatisticsEmployeeTable } from "../../components/statistics/StatisticsEmployeeTable";
import { StatisticsFiltersBar } from "../../components/statistics/StatisticsFiltersBar";
import { StatisticsInventoryTable } from "../../components/statistics/StatisticsInventoryTable";
import { StatisticsKpiCards } from "../../components/statistics/StatisticsKpiCards";
import { StatisticsLocationTable } from "../../components/statistics/StatisticsLocationTable";
import {
  buildHorizontalBarOption,
  buildStatusDistributionOption,
  buildTimelineChartOption,
  buildVerticalBarOption,
} from "../../components/statistics/statistics-chart-options";
import {
  useStatisticsByEmployee,
  useStatisticsByInventory,
  useStatisticsByLocation,
  useStatisticsStatusDistribution,
  useStatisticsSummary,
  useStatisticsTimeline,
} from "../../hooks/useStatistics";
import { usePaginationState } from "../../hooks/usePaginationState";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { StatisticsFilters, StatisticsValidationStatus } from "../../types/statistics";
import type { DateRangeValue } from "../../types/date-range";
import { getDefaultStatisticsDateRange, getDateRangeQueryValue, isInvalidCustomDateRange } from "../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../../utils/dates";
import { formatPercent } from "../../utils/export";
import { getApiErrorMessage } from "../../utils/errors";

type TabKey = "general" | "employee" | "inventory" | "location";

const SUMMARY_HEADERS = [
  "Métrica",
  "Valor",
];

export function StatisticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
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

  return (
    <AdminLayout>
      <PageHeader
        title="Estadísticas de asistencia"
        description="Panel analítico de asistencias por empleado, inventario y tienda con filtros globales y exportación."
      />

      <StatisticsFiltersBar
        dateRange={dateRange}
        defaultDateRange={defaultDateRange}
        inventoryId={inventoryId}
        storeId={storeId}
        employeeId={employeeId}
        validationStatus={validationStatus}
        locationStatus={locationStatus}
        punctualityStatus={punctualityStatus}
        onDateRangeChange={(value) => {
          resetAllPages();
          setDateRange(value);
        }}
        onInventoryChange={(value) => {
          resetAllPages();
          setInventoryId(value);
        }}
        onStoreChange={(value) => {
          resetAllPages();
          setStoreId(value);
        }}
        onEmployeeChange={(value) => {
          resetAllPages();
          setEmployeeId(value);
        }}
        onValidationStatusChange={(value) => {
          resetAllPages();
          setValidationStatus(value);
        }}
        onLocationStatusChange={(value) => {
          resetAllPages();
          setLocationStatus(value);
        }}
        onPunctualityStatusChange={(value) => {
          resetAllPages();
          setPunctualityStatus(value);
        }}
      />

      {exportsDisabled ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
          Completá un rango de fechas válido antes de exportar.
        </Typography>
      ) : null}

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3, mt: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_event, value: TabKey) => setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="general" label="General" />
          <Tab value="employee" label="Por empleado" />
          <Tab value="inventory" label="Por inventario" />
          <Tab value="location" label="Por tienda / ubicación" />
        </Tabs>
      </Box>

      {activeTab === "general" ? (
        <Stack spacing={3}>
          <Stack direction="row" justifyContent="flex-end">
            <ExportActionButtons
              baseName="attendance-summary"
              headers={SUMMARY_HEADERS}
              rows={summaryExportRows}
              dateFrom={isoDateFrom}
              dateTo={isoDateTo}
              sheetName="Resumen"
              disabled={exportsDisabled}
            />
          </Stack>

          {summaryQuery.isError ? (
            <ErrorState message={getApiErrorMessage(summaryQuery.error)} />
          ) : (
            <StatisticsKpiCards summary={summary} isLoading={summaryQuery.isPending} />
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ChartCard
                title="Asistencia en el tiempo"
                isLoading={timelineQuery.isPending}
                isEmpty={timeline.length === 0}
                option={timelineOption}
                exportHeaders={[
                  "Fecha",
                  "Presente",
                  "Tarde",
                  "Fuera geocerca",
                  "Pendiente",
                  "Rechazado",
                  "Sin asistencia",
                  "Total",
                ]}
                exportRows={timelineExportRows}
                exportBaseName="attendance-timeline"
                dateFrom={isoDateFrom}
                dateTo={isoDateTo}
                exportsDisabled={exportsDisabled}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard
                title="Distribución por estado"
                isLoading={distributionQuery.isPending}
                isEmpty={distribution.length === 0}
                option={distributionOption}
                exportHeaders={["Estado", "Cantidad"]}
                exportRows={distribution.map((item) => [item.label, item.count])}
                exportBaseName="attendance-status-distribution"
                dateFrom={isoDateFrom}
                dateTo={isoDateTo}
                exportsDisabled={exportsDisabled}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                title="% asistencia por inventario (top 10)"
                isLoading={inventoryExportQuery.isPending}
                isEmpty={topInventoriesByAttendance.length === 0}
                option={buildHorizontalBarOption(
                  "",
                  topInventoriesByAttendance.map(
                    (row) => `${row.storeName} (${row.scheduledStart.slice(0, 10)})`,
                  ),
                  topInventoriesByAttendance.map((row) => row.attendancePercentage),
                )}
                exportHeaders={["Inventario", "Tienda", "Fecha", "% asistencia"]}
                exportRows={topInventoriesByAttendance.map((row) => [
                  row.inventoryId,
                  row.storeName,
                  row.scheduledStart.slice(0, 10),
                  formatPercent(row.attendancePercentage),
                ])}
                exportBaseName="attendance-by-inventory-chart"
                dateFrom={isoDateFrom}
                dateTo={isoDateTo}
                exportsDisabled={exportsDisabled}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                title="Top empleados por % asistencia"
                isLoading={employeeExportQuery.isPending}
                isEmpty={topEmployeesByAttendance.length === 0}
                option={buildHorizontalBarOption(
                  "",
                  topEmployeesByAttendance.map((row) => row.employeeName),
                  topEmployeesByAttendance.map((row) => row.attendancePercentage),
                )}
                exportHeaders={["Empleado", "% asistencia"]}
                exportRows={topEmployeesByAttendance.map((row) => [
                  row.employeeName,
                  formatPercent(row.attendancePercentage),
                ])}
                exportBaseName="attendance-top-employees"
                dateFrom={isoDateFrom}
                dateTo={isoDateTo}
                exportsDisabled={exportsDisabled}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                title="Empleados con más registros tarde"
                isLoading={employeeExportQuery.isPending}
                isEmpty={topLateEmployees.length === 0}
                option={buildVerticalBarOption(
                  "",
                  topLateEmployees.map((row) => row.employeeName),
                  topLateEmployees.map((row) => row.lateCount),
                )}
                exportHeaders={["Empleado", "Registros tarde"]}
                exportRows={topLateEmployees.map((row) => [row.employeeName, row.lateCount])}
                exportBaseName="attendance-late-employees"
                dateFrom={isoDateFrom}
                dateTo={isoDateTo}
                exportsDisabled={exportsDisabled}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                title="Rendimiento por tienda / ubicación"
                isLoading={locationExportQuery.isPending}
                isEmpty={topLocationsByAttendance.length === 0}
                option={buildVerticalBarOption(
                  "",
                  topLocationsByAttendance.map((row) => row.storeName),
                  topLocationsByAttendance.map((row) => row.averageAttendancePercentage),
                  "%",
                )}
                exportHeaders={["Tienda", "% asistencia promedio"]}
                exportRows={topLocationsByAttendance.map((row) => [
                  row.storeName,
                  formatPercent(row.averageAttendancePercentage),
                ])}
                exportBaseName="attendance-by-location-chart"
                dateFrom={isoDateFrom}
                dateTo={isoDateTo}
                exportsDisabled={exportsDisabled}
              />
            </Grid>
          </Grid>
        </Stack>
      ) : null}

      {activeTab === "employee" ? (
        <StatisticsEmployeeTable
          rows={employeeQuery.data?.data ?? []}
          isLoading={employeeQuery.isPending}
          isError={employeeQuery.isError}
          error={employeeQuery.error}
          page={employeePagination.page}
          pageSize={employeePagination.pageSize}
          total={employeeQuery.data?.meta.total ?? 0}
          sortBy={employeeSortBy as never}
          sortDirection={employeeSortDirection}
          onPageChange={employeePagination.onPageChange}
          onPageSizeChange={employeePagination.onPageSizeChange}
          onSortChange={handleEmployeeSort as never}
          exportRows={employeeExportQuery.data?.data ?? []}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          exportsDisabled={exportsDisabled}
        />
      ) : null}

      {activeTab === "inventory" ? (
        <StatisticsInventoryTable
          rows={inventoryQuery.data?.data ?? []}
          isLoading={inventoryQuery.isPending}
          isError={inventoryQuery.isError}
          error={inventoryQuery.error}
          page={inventoryPagination.page}
          pageSize={inventoryPagination.pageSize}
          total={inventoryQuery.data?.meta.total ?? 0}
          sortBy={inventorySortBy as never}
          sortDirection={inventorySortDirection}
          onPageChange={inventoryPagination.onPageChange}
          onPageSizeChange={inventoryPagination.onPageSizeChange}
          onSortChange={handleInventorySort as never}
          exportRows={inventoryExportQuery.data?.data ?? []}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          exportsDisabled={exportsDisabled}
        />
      ) : null}

      {activeTab === "location" ? (
        <StatisticsLocationTable
          rows={locationQuery.data?.data ?? []}
          isLoading={locationQuery.isPending}
          isError={locationQuery.isError}
          error={locationQuery.error}
          page={locationPagination.page}
          pageSize={locationPagination.pageSize}
          total={locationQuery.data?.meta.total ?? 0}
          sortBy={locationSortBy as never}
          sortDirection={locationSortDirection}
          onPageChange={locationPagination.onPageChange}
          onPageSizeChange={locationPagination.onPageSizeChange}
          onSortChange={handleLocationSort as never}
          exportRows={locationExportQuery.data?.data ?? []}
          dateFrom={isoDateFrom}
          dateTo={isoDateTo}
          exportsDisabled={exportsDisabled}
        />
      ) : null}
    </AdminLayout>
  );
}
