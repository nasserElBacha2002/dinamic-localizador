import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { ClickableTableRow } from "../../components/common/ClickableTableRow";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { StatusChip } from "../../components/common/StatusChip";
import { EmployeeLookupAutocomplete } from "../../components/lookups/EmployeeLookupAutocomplete";
import { InventoryLookupAutocomplete } from "../../components/lookups/InventoryLookupAutocomplete";
import { StoreLookupAutocomplete } from "../../components/lookups/StoreLookupAutocomplete";
import { useAttendanceRecords, useExportAttendanceCsv } from "../../hooks/useAttendance";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { LocationStatus, PunctualityStatus, ValidationStatus } from "../../types/attendance";
import type { DateRangeValue } from "../../types/date-range";
import { EMPTY_DATE_RANGE_VALUE, getDateRangeQueryValue, isInvalidCustomDateRange } from "../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import { isModuleEnabled } from "../../utils/company-modules";

export function AttendanceListPage() {
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
  const permissions = permissionsQuery.data?.permissions;
  const canExport = hasPermission(permissions, "attendance:export");
  const canUseBotSimulator =
    isModuleEnabled(modulesQuery.data, "bot_simulator") &&
    hasPermission(permissions, "bot_simulator:use");

  const pagination = usePaginationState(10);
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
    page: pagination.page,
    limit: pagination.pageSize,
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

  return (
    <AdminLayout>
      <PageHeader
        title="Asistencias"
        description={`Revisá los registros de llegada a ${terminology.operation.plural.toLowerCase()}.`}
        action={
          canExport || canUseBotSimulator ? (
            <Stack direction="row" spacing={1} alignItems="center">
              {canExport ? (
                <>
                  <Button
                    variant="outlined"
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
                    <Typography variant="caption" color="error">
                      Completá un rango de fechas válido antes de exportar.
                    </Typography>
                  ) : null}
                </>
              ) : null}
              {canUseBotSimulator ? (
                <PageHeaderLinkAction to="/bot-simulator" label="Probar flujo del bot" />
              ) : null}
            </Stack>
          ) : undefined
        }
      />

      <ListFilters>
        <FilterItem>
          <InventoryLookupAutocomplete
            value={inventoryId || null}
            onChange={(id) => {
              pagination.resetPage();
              setInventoryId(id ?? "");
            }}
          />
        </FilterItem>

        <FilterItem>
          <EmployeeLookupAutocomplete
            value={employeeId || null}
            onChange={(id) => {
              pagination.resetPage();
              setEmployeeId(id ?? "");
            }}
            activeOnly={false}
          />
        </FilterItem>

        <FilterItem>
          <StoreLookupAutocomplete
            value={storeId || null}
            onChange={(id) => {
              pagination.resetPage();
              setStoreId(id ?? "");
            }}
            activeOnly={false}
          />
        </FilterItem>

        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-validation-filter">Validación</InputLabel>
            <Select
              labelId="attendance-validation-filter"
              label="Validación"
              value={validationStatus}
              onChange={(event) => {
                pagination.resetPage();
                setValidationStatus(event.target.value as ValidationStatus | "");
              }}
            >
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(validationStatusLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-location-filter">Ubicación</InputLabel>
            <Select
              labelId="attendance-location-filter"
              label="Ubicación"
              value={locationStatus}
              onChange={(event) => {
                pagination.resetPage();
                setLocationStatus(event.target.value as LocationStatus | "");
              }}
            >
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(locationStatusLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-punctuality-filter">Puntualidad</InputLabel>
            <Select
              labelId="attendance-punctuality-filter"
              label="Puntualidad"
              value={punctualityStatus}
              onChange={(event) => {
                pagination.resetPage();
                setPunctualityStatus(event.target.value as PunctualityStatus | "");
              }}
            >
              <MenuItem value="">Todas</MenuItem>
              {Object.entries(punctualityStatusLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-record-type-filter">Tipo de registro</InputLabel>
            <Select
              labelId="attendance-record-type-filter"
              label="Tipo de registro"
              value={recordType}
              onChange={(event) => {
                pagination.resetPage();
                setRecordType(event.target.value as "real" | "simulation" | "all");
              }}
            >
              <MenuItem value="real">Registros reales</MenuItem>
              <MenuItem value="simulation">Registros simulados</MenuItem>
              <MenuItem value="all">Todos los registros</MenuItem>
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem size={{ xs: 12, sm: 12, md: 6, lg: 4 }}>
          <DateRangeFilter
            value={dateRange}
            onChange={(nextDateRange) => {
              pagination.resetPage();
              setDateRange(nextDateRange);
            }}
            mode="past"
            label="Fecha"
            allowCustomRange
          />
        </FilterItem>
      </ListFilters>

      {isPending ? <LoadingState /> : null}
      {isError ? <ErrorState message={getApiErrorMessage(error)} /> : null}
      {data && !isError && data.data.length === 0 ? <EmptyState title="No hay asistencias registradas" /> : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Listado de asistencias">
              <TableHead>
                <TableRow>
                  <TableCell>{terminology.worker.singular}</TableCell>
                  <TableCell>{terminology.location.singular}</TableCell>
                  <TableCell>{terminology.operation.singular}</TableCell>
                  <TableCell>Llegada</TableCell>
                  <TableCell>Salida</TableCell>
                  <TableCell>Distancia</TableCell>
                  <TableCell>Validación</TableCell>
                  <TableCell>Ubicación</TableCell>
                  <TableCell>Puntualidad</TableCell>
                  <TableCell>Tipo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((record) => (
                  <ClickableTableRow
                    key={record.id}
                    to={`/attendance/${record.id}`}
                    ariaLabel={`Ver asistencia de ${record.employee.name}`}
                  >
                    <TableCell>{record.employee.name}</TableCell>
                    <TableCell>{record.store.name}</TableCell>
                    <TableCell>{formatDateTime(record.inventory.scheduledStart)}</TableCell>
                    <TableCell>{formatDateTime(record.receivedAt)}</TableCell>
                    <TableCell>{formatDateTime(record.checkoutAt)}</TableCell>
                    <TableCell>{record.distanceMeters.toFixed(1)} m</TableCell>
                    <TableCell>
                      <StatusChip label={validationStatusLabels[record.validationStatus]} />
                    </TableCell>
                    <TableCell>
                      <StatusChip label={locationStatusLabels[record.locationStatus]} />
                    </TableCell>
                    <TableCell>
                      <StatusChip label={punctualityStatusLabels[record.punctualityStatus]} />
                    </TableCell>
                    <TableCell>
                      {record.isSimulation ? <StatusChip label="Simulación" /> : "Real"}
                    </TableCell>
                  </ClickableTableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <PaginationControls
            meta={data.meta}
            onPageChange={pagination.onPageChange}
            pageSize={pagination.pageSize}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector
          />
        </>
      ) : null}
    </AdminLayout>
  );
}
