import { Button, Group, Select, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmployeeLookupAutocomplete } from "../../components/lookups/EmployeeLookupAutocomplete";
import { InventoryLookupAutocomplete } from "../../components/lookups/InventoryLookupAutocomplete";
import { StoreLookupAutocomplete } from "../../components/lookups/StoreLookupAutocomplete";
import {
  DataTable,
  FilterBar,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useAttendanceRecords, useExportAttendanceCsv } from "../../hooks/useAttendance";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { AttendanceRecordWithRelations, LocationStatus, PunctualityStatus, ValidationStatus } from "../../types/attendance";
import type { DateRangeValue } from "../../types/date-range";
import { terminology } from "../../domain/terminology";
import { isModuleEnabled } from "../../utils/company-modules";
import { EMPTY_DATE_RANGE_VALUE, getDateRangeQueryValue, isInvalidCustomDateRange } from "../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function AttendanceListPage() {
  const navigate = useNavigate();
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
  const permissions = permissionsQuery.data?.permissions;
  const canExport = hasPermission(permissions, "attendance:export");
  const canUseBotSimulator =
    isModuleEnabled(modulesQuery.data, "bot_simulator") &&
    hasPermission(permissions, "bot_simulator:use");

  const pagination = usePaginationState(10);
  const { resetPage, page, pageSize, onPageChange, onPageSizeChange } = pagination;
  const [inventoryId, setInventoryId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [validationStatus, setValidationStatus] = useState<ValidationStatus | "">("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus | "">("");
  const [punctualityStatus, setPunctualityStatus] = useState<PunctualityStatus | "">("");
  const [recordType, setRecordType] = useState<"real" | "simulation" | "all">("real");
  const [dateRange, setDateRange] = useState<DateRangeValue>(EMPTY_DATE_RANGE_VALUE);

  const exportMutation = useExportAttendanceCsv();
  const dateQuery = getDateRangeQueryValue(dateRange);
  const exportsDisabled = isInvalidCustomDateRange(dateRange);
  const filters = {
    page,
    limit: pageSize,
    inventoryId: inventoryId || undefined,
    employeeId: employeeId || undefined,
    storeId: storeId || undefined,
    validationStatus: validationStatus || undefined,
    locationStatus: locationStatus || undefined,
    punctualityStatus: punctualityStatus || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
    includeSimulation: recordType === "all" ? true : undefined,
    simulationOnly: recordType === "simulation" ? true : undefined,
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
      { key: "employee", header: terminology.worker.singular, getValue: (row) => row.employee.name },
      { key: "store", header: terminology.location.singular, getValue: (row) => row.store.name },
      {
        key: "inventory",
        header: terminology.operation.singular,
        getValue: (row) => formatDateTime(row.inventory.scheduledStart),
      },
      { key: "receivedAt", header: "Llegada", getValue: (row) => formatDateTime(row.receivedAt) },
      { key: "checkoutAt", header: "Salida", getValue: (row) => formatDateTime(row.checkoutAt) },
      {
        key: "distance",
        header: "Distancia",
        getValue: (row) => `${row.distanceMeters.toFixed(1)} m`,
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
            value={inventoryId || null}
            onChange={(id) => {
              resetPage();
              setInventoryId(id ?? "");
            }}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <EmployeeLookupAutocomplete
            value={employeeId || null}
            onChange={(id) => {
              resetPage();
              setEmployeeId(id ?? "");
            }}
            activeOnly={false}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <StoreLookupAutocomplete
            value={storeId || null}
            onChange={(id) => {
              resetPage();
              setStoreId(id ?? "");
            }}
            activeOnly={false}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <Select
            label="Validación"
            value={validationStatus}
            onChange={(value) => {
              resetPage();
              setValidationStatus((value ?? "") as ValidationStatus | "");
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(validationStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <Select
            label="Ubicación"
            value={locationStatus}
            onChange={(value) => {
              resetPage();
              setLocationStatus((value ?? "") as LocationStatus | "");
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(locationStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <Select
            label="Puntualidad"
            value={punctualityStatus}
            onChange={(value) => {
              resetPage();
              setPunctualityStatus((value ?? "") as PunctualityStatus | "");
            }}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(punctualityStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <Select
            label="Tipo de registro"
            value={recordType}
            onChange={(value) => {
              resetPage();
              setRecordType((value ?? "real") as "real" | "simulation" | "all");
            }}
            data={[
              { value: "real", label: "Registros reales" },
              { value: "simulation", label: "Registros simulados" },
              { value: "all", label: "Todos los registros" },
            ]}
          />
        </FilterBar.Item>

        <FilterBar.Item minWidth={280}>
          <DateRangeFilter
            value={dateRange}
            onChange={(nextDateRange) => {
              resetPage();
              setDateRange(nextDateRange);
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
        onRowClick={(row) => navigate(`/attendance/${row.id}`)}
        aria-label="Listado de asistencias"
        pagination={
          data && data.data.length > 0 ? (
            <PaginationControls
              meta={mapApiPaginationMeta(data.meta)}
              onPageChange={onPageChange}
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
              showPageSizeSelector
            />
          ) : undefined
        }
      />
    </>
  );
}
