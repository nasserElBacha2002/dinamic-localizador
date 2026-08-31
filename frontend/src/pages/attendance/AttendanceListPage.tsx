import { Button, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { EntityLink } from "../../components/entity-link";
import { EmployeeMultiSelect } from "../../components/lookups/EntityMultiSelects";
import { OperationMultiSelect } from "../../components/lookups/EntityMultiSelects";
import { ServiceMultiSelect } from "../../components/lookups/EntityMultiSelects";
import {
  ActionMenu,
  DataTable,
  FilterBar,
  FilterDateRangeInput,
  FilterSelect,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useAttendanceRecords, useExportAttendanceCsv } from "../../hooks/useAttendance";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type {
  AttendanceRecordWithRelations,
  CheckoutStatus,
  LocationStatus,
  PunctualityStatus,
  ValidationStatus,
} from "../../types/attendance";
import { terminology } from "../../domain/terminology";
import { isModuleEnabled } from "../../utils/company-modules";
import { getDateRangeQueryValue, isInvalidCustomDateRange } from "../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../utils/date-range-url";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { formatAttendanceArrivalLabel } from "../../utils/attendance-display";
import { formatDistanceMeters, getRelatedName } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import {
  checkoutStatusLabels,
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import { navigateWithListContext } from "../../utils/list-navigation";
import {
  ATTENDANCE_TABLE_DEFAULTS,
  ATTENDANCE_TABLE_FIELDS,
  shouldOmitAttendanceTableValue,
} from "./attendance-list-table-state";

const ATTENDANCE_LIST_PATH = "/attendance";

export function AttendanceListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
  const permissions = permissionsQuery.data?.permissions;
  const canExport = hasPermission(permissions, "attendance:export");
  const canUseBotSimulator =
    isModuleEnabled(modulesQuery.data, "bot_simulator") &&
    hasPermission(permissions, "bot_simulator:use");

  const table = useTableUrlState({
    defaults: ATTENDANCE_TABLE_DEFAULTS,
    fields: ATTENDANCE_TABLE_FIELDS,
    shouldOmitFromUrl: shouldOmitAttendanceTableValue,
  });

  const exportMutation = useExportAttendanceCsv();
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
  const exportsDisabled = isInvalidCustomDateRange(dateRange);
  const filters = {
    page: table.page,
    limit: table.pageSize,
    operationIds: table.state.operationIds.length > 0 ? table.state.operationIds : undefined,
    employeeIds: table.state.employeeIds.length > 0 ? table.state.employeeIds : undefined,
    serviceIds: table.state.serviceIds.length > 0 ? table.state.serviceIds : undefined,
    validationStatus: (table.state.validationStatus as ValidationStatus) || undefined,
    locationStatus: (table.state.locationStatus as LocationStatus) || undefined,
    punctualityStatus: (table.state.punctualityStatus as PunctualityStatus) || undefined,
    checkoutStatus: (table.state.checkoutStatus as CheckoutStatus) || undefined,
    openAttendance: table.state.openAttendance || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
    includeSimulation: table.state.recordType === "all" ? true : undefined,
    simulationOnly: table.state.recordType === "simulation" ? true : undefined,
  };

  const { data, isPending, isError, error } = useAttendanceRecords(filters);

  const handleExport = async () => {
    if (exportsDisabled) {
      return;
    }

    try {
      const blob = await exportMutation.mutateAsync(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "asistencias.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // handled by mutation state if needed
    }
  };

  const columns = useMemo<DataTableColumn<AttendanceRecordWithRelations>[]>(
    () => [
      {
        key: "employee",
        header: terminology.worker.singular,
        render: (row) => (
          <EntityLink
            entityType="employee"
            entityId={row.employee?.id ?? row.employeeId}
            label={getRelatedName(row.employee)}
            stopPropagation
          />
        ),
      },
      {
        key: "service",
        header: terminology.service.singular,
        render: (row) => (
          <EntityLink
            entityType="service"
            entityId={row.service?.id}
            label={getRelatedName(row.service)}
            stopPropagation
          />
        ),
      },
      {
        key: "operation",
        header: terminology.operation.singular,
        render: (row) => (
          <EntityLink
            entityType="operation"
            entityId={row.operationId}
            label={formatDateTime(row.operation?.scheduledStart)}
            stopPropagation
          />
        ),
      },
      { key: "receivedAt", header: "Llegada", getValue: (row) => formatAttendanceArrivalLabel(row.receivedAt, formatDateTime) },
      { key: "checkoutAt", header: "Salida", getValue: (row) => formatDateTime(row.checkoutAt) },
      {
        key: "distance",
        header: "Distancia",
        getValue: (row) => formatDistanceMeters(row.distanceMeters),
      },
      {
        key: "validationStatus",
        header: "Validación",
        render: (row) => (
          <StatusBadge label={validationStatusLabels[row.validationStatus]} tone="neutral" />
        ),
      },
      {
        key: "locationStatus",
        header: "Ubicación",
        render: (row) => (
          <StatusBadge label={locationStatusLabels[row.locationStatus]} tone="neutral" />
        ),
      },
      {
        key: "punctualityStatus",
        header: "Puntualidad",
        render: (row) => (
          <StatusBadge label={punctualityStatusLabels[row.punctualityStatus]} tone="neutral" />
        ),
      },
      {
        key: "recordType",
        header: "Tipo",
        render: (row) =>
          row.isSimulation ? (
            <StatusBadge label="Simulación" tone="info" variant="light" />
          ) : (
            "Real"
          ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<AttendanceRecordWithRelations>>(
    () => ({
      title: (row) => (
        <EntityLink
          entityType="employee"
          entityId={row.employee?.id ?? row.employeeId}
          label={getRelatedName(row.employee)}
            stopPropagation
          />
      ),
      status: (row) => (
        <StatusBadge label={validationStatusLabels[row.validationStatus]} tone="neutral" />
      ),
      fields: [
        {
          key: "service",
          label: terminology.service.singular,
          render: (row) => (
            <EntityLink
              entityType="service"
              entityId={row.service?.id}
              label={getRelatedName(row.service)}
            stopPropagation
          />
          ),
          visibility: "always",
        },
        {
          key: "receivedAt",
          label: "Llegada",
          getValue: (row) => formatAttendanceArrivalLabel(row.receivedAt, formatDateTime),
          visibility: "always",
        },
        {
          key: "checkoutAt",
          label: "Salida",
          getValue: (row) => formatDateTime(row.checkoutAt),
          visibility: "always",
        },
        {
          key: "operation",
          label: terminology.operation.singular,
          render: (row) => (
            <EntityLink
              entityType="operation"
              entityId={row.operationId}
              label={formatDateTime(row.operation?.scheduledStart)}
            stopPropagation
          />
          ),
          visibility: "expanded",
        },
        {
          key: "distance",
          label: "Distancia",
          getValue: (row) => formatDistanceMeters(row.distanceMeters),
          visibility: "expanded",
        },
        {
          key: "locationStatus",
          label: "Ubicación",
          getValue: (row) => locationStatusLabels[row.locationStatus],
          visibility: "expanded",
        },
        {
          key: "punctualityStatus",
          label: "Puntualidad",
          getValue: (row) => punctualityStatusLabels[row.punctualityStatus],
          visibility: "expanded",
        },
        {
          key: "recordType",
          label: "Tipo",
          getValue: (row) => (row.isSimulation ? "Simulación" : "Real"),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <PageHeader
        title="Asistencias"
        description={`Revisá los registros de llegada a ${terminology.operation.plural.toLowerCase()}.`}
        action={
          canExport || canUseBotSimulator ? (
            <ActionMenu
              primary={
                canExport ? (
                  <Button
                    variant="default"
                    onClick={() => void handleExport()}
                    disabled={exportMutation.isPending || exportsDisabled}
                    title={
                      exportsDisabled
                        ? "Completá un rango de fechas válido antes de exportar."
                        : undefined
                    }
                  >
                    Exportar CSV
                  </Button>
                ) : canUseBotSimulator ? (
                  <Button component={Link} to="/bot-simulator" variant="default">
                    Probar flujo del bot
                  </Button>
                ) : undefined
              }
              items={
                canExport && canUseBotSimulator
                  ? [
                      {
                        key: "bot",
                        label: "Probar flujo del bot",
                        onClick: () => navigate("/bot-simulator"),
                      },
                    ]
                  : []
              }
              menuLabel="Más acciones de asistencias"
            />
          ) : undefined
        }
      />
      {canExport && exportsDisabled ? (
        <Text size="xs" c="red" mb="sm">
          Completá un rango de fechas válido antes de exportar.
        </Text>
      ) : null}

      <FilterBar
        search={
          <FilterDateRangeInput
            value={dateRange}
            onChange={(nextDateRange) => {
              table.setState(dateRangeToUrlFields(nextDateRange));
            }}
            mode="past"
            label="Fecha"
            allowCustomRange
          />
        }
        activeFilterCount={table.activeFilterCount}
        onClearFilters={table.resetFilters}
      >
        <FilterBar.Item>
          <OperationMultiSelect
            label={terminology.operation.plural}
            value={table.state.operationIds}
            onChange={(ids) => table.setField("operationIds", ids)}
            maxVisibleChips={2}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <EmployeeMultiSelect
            label={terminology.worker.plural}
            value={table.state.employeeIds}
            onChange={(ids) => table.setField("employeeIds", ids)}
            activeOnly={false}
            maxVisibleChips={2}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <ServiceMultiSelect
            label={terminology.service.plural}
            value={table.state.serviceIds}
            onChange={(ids) => table.setField("serviceIds", ids)}
            activeOnly={false}
            maxVisibleChips={2}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <FilterSelect
            label="Validación"
            value={table.state.validationStatus}
            onChange={(nextValue) => {
              table.setField("validationStatus", nextValue);
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(validationStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <FilterSelect
            label="Ubicación"
            value={table.state.locationStatus}
            onChange={(nextValue) => {
              table.setField("locationStatus", nextValue);
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(locationStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <FilterSelect
            label="Puntualidad"
            value={table.state.punctualityStatus}
            onChange={(nextValue) => {
              table.setField("punctualityStatus", nextValue);
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(punctualityStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <FilterSelect
            label="Salida"
            value={table.state.checkoutStatus}
            onChange={(nextValue) => {
              table.setField("checkoutStatus", nextValue);
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(checkoutStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <FilterSelect
            label="Sin cierre"
            value={table.state.openAttendance ? "true" : ""}
            onChange={(nextValue) => {
              table.setField("openAttendance", nextValue === "true");
            }}
            data={[
              { value: "", label: "Todas" },
              { value: "true", label: "Solo jornadas sin cierre vencidas" },
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <FilterSelect
            label="Tipo de registro"
            value={table.state.recordType}
            onChange={(nextValue) => {
              table.setField("recordType", (nextValue || "real") as "real" | "simulation" | "all");
            }}
            data={[
              { value: "real", label: "Registros reales" },
              { value: "simulation", label: "Registros simulados" },
              { value: "all", label: "Todos los registros" },
            ]}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        rows={data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.id}
        loading={isPending}
        error={isError ? getApiErrorMessage(error) : undefined}
        emptyTitle="No hay asistencias registradas"
        emptyDescription="Ajustá los filtros o esperá nuevos registros de asistencia."
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/attendance/${row.id}`, ATTENDANCE_LIST_PATH, location)
        }
        mobileView="summary"
        mobileCard={mobileCard}
        aria-label="Listado de asistencias"
        pagination={
          data && data.data.length > 0 ? (
            <PaginationControls
              meta={mapApiPaginationMeta(data.meta)}
              onPageChange={table.onPageChange}
              pageSize={table.pageSize}
              onPageSizeChange={table.onPageSizeChange}
              showPageSizeSelector
            />
          ) : undefined
        }
      />
    </>
  );
}
