import { Stack, Tabs, Text } from "@mantine/core";
import { PageHeader } from "../../design-system";
import { StatisticsEmployeeTable } from "../../components/statistics/StatisticsEmployeeTable";
import { StatisticsFiltersBar } from "../../components/statistics/StatisticsFiltersBar";
import { StatisticsOperationTable } from "../../components/statistics/StatisticsOperationTable";
import { StatisticsLocationTable } from "../../components/statistics/StatisticsLocationTable";
import { StatisticsGeneralTab } from "./components/StatisticsGeneralTab";
import { useStatisticsPageData } from "./hooks/useStatisticsPageData";
import type { StatisticsTabKey } from "./hooks/useStatisticsPageData";

export function StatisticsPage() {
  const data = useStatisticsPageData();

  return (
    <Stack gap="md">
      <PageHeader
        title="Estadísticas"
        description="Panel analítico de asistencias por colaborador, operación y ubicación."
      />

      <StatisticsFiltersBar
        dateRange={data.dateRange}
        defaultDateRange={data.defaultDateRange}
        operationId={data.operationId}
        serviceId={data.serviceId}
        employeeId={data.employeeId}
        validationStatus={data.validationStatus}
        locationStatus={data.locationStatus}
        punctualityStatus={data.punctualityStatus}
        onDateRangeChange={(value) => {
          data.resetAllPages();
          data.setDateRange(value);
        }}
        onOperationChange={(value) => {
          data.resetAllPages();
          data.setOperationId(value);
        }}
        onServiceChange={(value) => {
          data.resetAllPages();
          data.setServiceId(value);
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
        <Text size="xs" c="red" mt="xs">
          Completá un rango de fechas válido antes de exportar.
        </Text>
      ) : null}

      <Tabs
        value={data.activeTab}
        onChange={(value) => data.setActiveTab((value ?? "general") as StatisticsTabKey)}
        mt="md"
        mb="lg"
      >
        <Tabs.List>
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="employee">Por empleado</Tabs.Tab>
          <Tabs.Tab value="operation">Por inventario</Tabs.Tab>
          <Tabs.Tab value="location">Por tienda / ubicación</Tabs.Tab>
        </Tabs.List>
      </Tabs>

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

      {data.activeTab === "operation" ? (
        <StatisticsOperationTable
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
          onSortChange={data.handleOperationSort as never}
          exportRows={data.inventoryExportQuery.data?.data ?? []}
          dateFrom={data.isoDateFrom}
          dateTo={data.isoDateTo}
          exportsDisabled={data.exportsDisabled}
        />
      ) : null}

      {data.activeTab === "location" ? (
        <StatisticsLocationTable
          rows={data.serviceQuery.data?.data ?? []}
          isLoading={data.serviceQuery.isPending}
          isError={data.serviceQuery.isError}
          error={data.serviceQuery.error}
          page={data.locationPagination.page}
          pageSize={data.locationPagination.pageSize}
          total={data.serviceQuery.data?.meta.total ?? 0}
          sortBy={data.locationSortBy as never}
          sortDirection={data.locationSortDirection}
          onPageChange={data.locationPagination.onPageChange}
          onPageSizeChange={data.locationPagination.onPageSizeChange}
          onSortChange={data.handleLocationSort as never}
          exportRows={data.serviceExportQuery.data?.data ?? []}
          dateFrom={data.isoDateFrom}
          dateTo={data.isoDateTo}
          exportsDisabled={data.exportsDisabled}
        />
      ) : null}
    </Stack>
  );
}
