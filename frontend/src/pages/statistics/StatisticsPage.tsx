import { Box, Tab, Tabs, Typography } from "@mui/material";
import { PageHeader } from "../../components/common/PageHeader";
import { StatisticsEmployeeTable } from "../../components/statistics/StatisticsEmployeeTable";
import { StatisticsFiltersBar } from "../../components/statistics/StatisticsFiltersBar";
import { StatisticsInventoryTable } from "../../components/statistics/StatisticsInventoryTable";
import { StatisticsLocationTable } from "../../components/statistics/StatisticsLocationTable";
import { StatisticsGeneralTab } from "./components/StatisticsGeneralTab";
import { useStatisticsPageData } from "./hooks/useStatisticsPageData";

export function StatisticsPage() {
  const data = useStatisticsPageData();

  return (
    <>
      <PageHeader
        title="Estadísticas de asistencia"
        description="Panel analítico de asistencias por empleado, inventario y tienda con filtros globales y exportación."
      />

      <StatisticsFiltersBar
        dateRange={data.dateRange}
        defaultDateRange={data.defaultDateRange}
        inventoryId={data.inventoryId}
        storeId={data.storeId}
        employeeId={data.employeeId}
        validationStatus={data.validationStatus}
        locationStatus={data.locationStatus}
        punctualityStatus={data.punctualityStatus}
        onDateRangeChange={(value) => {
          data.resetAllPages();
          data.setDateRange(value);
        }}
        onInventoryChange={(value) => {
          data.resetAllPages();
          data.setInventoryId(value);
        }}
        onStoreChange={(value) => {
          data.resetAllPages();
          data.setStoreId(value);
        }}
        onEmployeeChange={(value) => {
          data.resetAllPages();
          data.setEmployeeId(value);
        }}
        onValidationStatusChange={(value) => {
          data.resetAllPages();
          data.setValidationStatus(value);
        }}
        onLocationStatusChange={(value) => {
          data.resetAllPages();
          data.setLocationStatus(value);
        }}
        onPunctualityStatusChange={(value) => {
          data.resetAllPages();
          data.setPunctualityStatus(value);
        }}
      />

      {data.exportsDisabled ? (
        <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
          Completá un rango de fechas válido antes de exportar.
        </Typography>
      ) : null}

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3, mt: 2 }}>
        <Tabs
          value={data.activeTab}
          onChange={(_event, value) => data.setActiveTab(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="general" label="General" />
          <Tab value="employee" label="Por empleado" />
          <Tab value="inventory" label="Por inventario" />
          <Tab value="location" label="Por tienda / ubicación" />
        </Tabs>
      </Box>

      {data.activeTab === "general" ? <StatisticsGeneralTab {...data} /> : null}

      {data.activeTab === "employee" ? (
        <StatisticsEmployeeTable
          rows={data.employeeQuery.data?.data ?? []}
          isLoading={data.employeeQuery.isPending}
          isError={data.employeeQuery.isError}
          error={data.employeeQuery.error}
          page={data.employeePagination.page}
          pageSize={data.employeePagination.pageSize}
          total={data.employeeQuery.data?.meta.total ?? 0}
          sortBy={data.employeeSortBy as never}
          sortDirection={data.employeeSortDirection}
          onPageChange={data.employeePagination.onPageChange}
          onPageSizeChange={data.employeePagination.onPageSizeChange}
          onSortChange={data.handleEmployeeSort as never}
          exportRows={data.employeeExportQuery.data?.data ?? []}
          dateFrom={data.isoDateFrom}
          dateTo={data.isoDateTo}
          exportsDisabled={data.exportsDisabled}
        />
      ) : null}

      {data.activeTab === "inventory" ? (
        <StatisticsInventoryTable
          rows={data.inventoryQuery.data?.data ?? []}
          isLoading={data.inventoryQuery.isPending}
          isError={data.inventoryQuery.isError}
          error={data.inventoryQuery.error}
          page={data.inventoryPagination.page}
          pageSize={data.inventoryPagination.pageSize}
          total={data.inventoryQuery.data?.meta.total ?? 0}
          sortBy={data.inventorySortBy as never}
          sortDirection={data.inventorySortDirection}
          onPageChange={data.inventoryPagination.onPageChange}
          onPageSizeChange={data.inventoryPagination.onPageSizeChange}
          onSortChange={data.handleInventorySort as never}
          exportRows={data.inventoryExportQuery.data?.data ?? []}
          dateFrom={data.isoDateFrom}
          dateTo={data.isoDateTo}
          exportsDisabled={data.exportsDisabled}
        />
      ) : null}

      {data.activeTab === "location" ? (
        <StatisticsLocationTable
          rows={data.locationQuery.data?.data ?? []}
          isLoading={data.locationQuery.isPending}
          isError={data.locationQuery.isError}
          error={data.locationQuery.error}
          page={data.locationPagination.page}
          pageSize={data.locationPagination.pageSize}
          total={data.locationQuery.data?.meta.total ?? 0}
          sortBy={data.locationSortBy as never}
          sortDirection={data.locationSortDirection}
          onPageChange={data.locationPagination.onPageChange}
          onPageSizeChange={data.locationPagination.onPageSizeChange}
          onSortChange={data.handleLocationSort as never}
          exportRows={data.locationExportQuery.data?.data ?? []}
          dateFrom={data.isoDateFrom}
          dateTo={data.isoDateTo}
          exportsDisabled={data.exportsDisabled}
        />
      ) : null}
    </>
  );
}
