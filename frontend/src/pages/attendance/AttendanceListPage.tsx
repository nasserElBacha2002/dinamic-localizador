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
import { EmployeeSearchAutocomplete } from "../../components/employees/EmployeeSearchAutocomplete";
import { InventorySearchAutocomplete } from "../../components/inventories/InventorySearchAutocomplete";
import { StoreSearchAutocomplete } from "../../components/stores/StoreSearchAutocomplete";
import { useAttendanceRecords, useExportAttendanceCsv } from "../../hooks/useAttendance";
import { usePaginationState } from "../../hooks/usePaginationState";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { LocationStatus, PunctualityStatus, ValidationStatus } from "../../types/attendance";
import type { DateRangeValue } from "../../types/date-range";
import { EMPTY_DATE_RANGE_VALUE, getDateRangeQueryValue, isInvalidCustomDateRange } from "../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";

export function AttendanceListPage() {
  const pagination = usePaginationState(10);
  const [inventoryId, setInventoryId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [validationStatus, setValidationStatus] = useState<ValidationStatus | "">("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus | "">("");
  const [punctualityStatus, setPunctualityStatus] = useState<PunctualityStatus | "">("");
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
        description="Revisá los registros de llegada a inventarios."
        action={
          <Stack direction="row" spacing={1} alignItems="center">
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
            <PageHeaderLinkAction to="/attendance/new" label="Crear registro de prueba" />
          </Stack>
        }
      />

      <ListFilters>
        <FilterItem>
          <InventorySearchAutocomplete
            value={inventoryId || null}
            onChange={(id) => {
              pagination.resetPage();
              setInventoryId(id ?? "");
            }}
            allowCreate={false}
          />
        </FilterItem>

        <FilterItem>
          <EmployeeSearchAutocomplete
            value={employeeId || null}
            onChange={(id) => {
              pagination.resetPage();
              setEmployeeId(id ?? "");
            }}
            activeOnly={false}
            allowCreate={false}
          />
        </FilterItem>

        <FilterItem>
          <StoreSearchAutocomplete
            value={storeId || null}
            onChange={(id) => {
              pagination.resetPage();
              setStoreId(id ?? "");
            }}
            activeOnly={false}
            allowCreate={false}
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
                  <TableCell>Empleado</TableCell>
                  <TableCell>Tienda</TableCell>
                  <TableCell>Inventario</TableCell>
                  <TableCell>Llegada</TableCell>
                  <TableCell>Salida</TableCell>
                  <TableCell>Distancia</TableCell>
                  <TableCell>Validación</TableCell>
                  <TableCell>Ubicación</TableCell>
                  <TableCell>Puntualidad</TableCell>
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
