import { Button, Group, Text } from "@mantine/core";
import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { EmployeeLookupAutocomplete } from "../../components/lookups/EmployeeLookupAutocomplete";
import { InventoryLookupAutocomplete } from "../../components/lookups/InventoryLookupAutocomplete";
import { StoreLookupAutocomplete } from "../../components/lookups/StoreLookupAutocomplete";
import {
  DataTable,
  FilterBar,
  FilterDateRangeInput,
  FilterSelect,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useAttendanceRecords, useExportAttendanceCsv } from "../../hooks/useAttendance";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { AttendanceRecordWithRelations, LocationStatus, PunctualityStatus, ValidationStatus } from "../../types/attendance";
import { terminology } from "../../domain/terminology";
import { isModuleEnabled } from "../../utils/company-modules";
import { getDateRangeQueryValue, isInvalidCustomDateRange } from "../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../utils/date-range-url";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { formatDistanceMeters, getRelatedName } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import {
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
    inventoryId: table.state.inventoryId || undefined,
    employeeId: table.state.employeeId || undefined,
    storeId: table.state.storeId || undefined,
    validationStatus: (table.state.validationStatus as ValidationStatus) || undefined,
    locationStatus: (table.state.locationStatus as LocationStatus) || undefined,
    punctualityStatus: (table.state.punctualityStatus as PunctualityStatus) || undefined,
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
        getValue: (row) => getRelatedName(row.employee),
      },
      {
        key: "store",
        header: terminology.location.singular,
        getValue: (row) => getRelatedName(row.store),
      },
      {
        key: "inventory",
        header: terminology.operation.singular,
        getValue: (row) => formatDateTime(row.inventory?.scheduledStart),
      },
      { key: "receivedAt", header: "Llegada", getValue: (row) => formatDateTime(row.receivedAt) },
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

  return (
    <>
      <PageHeader
        title="Asistencias"
        description={`Revisá los registros de llegada a ${terminology.operation.plural.toLowerCase()}.`}
        action={
          canExport || canUseBotSimulator ? (
            <Group gap="xs" align="center">
              {canExport ? (
                <>
                  <Button
                    variant="default"
                    onClick={handleExport}
                    disabled={exportMutation.isPending || exportsDisabled}
                    title={
                      exportsDisabled
                        ? "Completá un rango de fechas válido antes de exportar."
                        : undefined
                    }
                  >
                    Exportar CSV
                  </Button>
                  {exportsDisabled ? (
                    <Text size="xs" c="red">
                      Completá un rango de fechas válido antes de exportar.
                    </Text>
                  ) : null}
                </>
              ) : null}
              {canUseBotSimulator ? (
                <Button component={Link} to="/bot-simulator" variant="default">
                  Probar flujo del bot
                </Button>
              ) : null}
            </Group>
          ) : undefined
        }
      />

      <FilterBar>
        <FilterBar.Item>
          <InventoryLookupAutocomplete
            value={table.state.inventoryId || null}
            onChange={(id) => {
              table.setField("inventoryId", id ?? "");
            }}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <EmployeeLookupAutocomplete
            value={table.state.employeeId || null}
            onChange={(id) => {
              table.setField("employeeId", id ?? "");
            }}
            activeOnly={false}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <StoreLookupAutocomplete
            value={table.state.storeId || null}
            onChange={(id) => {
              table.setField("storeId", id ?? "");
            }}
            activeOnly={false}
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

        <FilterBar.Item minWidth={280}>
          <FilterDateRangeInput
            value={dateRange}
            onChange={(nextDateRange) => {
              table.setState(dateRangeToUrlFields(nextDateRange));
            }}
            mode="past"
            label="Fecha"
            allowCustomRange
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
