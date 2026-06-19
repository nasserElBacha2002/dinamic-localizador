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
  TextField,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { StatusChip } from "../../components/common/StatusChip";
import { useAttendanceRecords, useExportAttendanceCsv } from "../../hooks/useAttendance";
import { useEmployees } from "../../hooks/useEmployees";
import { useInventories } from "../../hooks/useInventories";
import { usePaginationState } from "../../hooks/usePaginationState";
import { useStores } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { LocationStatus, PunctualityStatus, ValidationStatus } from "../../types/attendance";
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const exportMutation = useExportAttendanceCsv();
  const filters = {
    page: pagination.page,
    limit: pagination.pageSize,
    inventoryId: inventoryId || undefined,
    employeeId: employeeId || undefined,
    storeId: storeId || undefined,
    validationStatus: validationStatus || undefined,
    locationStatus: locationStatus || undefined,
    punctualityStatus: punctualityStatus || undefined,
    dateFrom: dateFrom ? dateInputToIsoStart(dateFrom) : undefined,
    dateTo: dateTo ? dateInputToIsoEnd(dateTo) : undefined,
  };

  const storesQuery = useStores({ page: 1, limit: 100 });
  const employeesQuery = useEmployees({ page: 1, limit: 100 });
  const inventoriesQuery = useInventories({ page: 1, limit: 100 });
  const { data, isPending, isError, error } = useAttendanceRecords(filters);

  const handleExport = async () => {
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
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={handleExport} disabled={exportMutation.isPending}>
              Exportar CSV
            </Button>
            <PageHeaderLinkAction to="/attendance/new" label="Crear registro de prueba" />
          </Stack>
        }
      />

      <ListFilters>
        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-inventory-filter">Inventario</InputLabel>
            <Select
              labelId="attendance-inventory-filter"
              label="Inventario"
              value={inventoryId}
              onChange={(event) => {
                pagination.resetPage();
                setInventoryId(event.target.value);
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              {inventoriesQuery.data?.data.map((inventory) => (
                <MenuItem key={inventory.id} value={inventory.id}>
                  {inventory.store.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-employee-filter">Empleado</InputLabel>
            <Select
              labelId="attendance-employee-filter"
              label="Empleado"
              value={employeeId}
              onChange={(event) => {
                pagination.resetPage();
                setEmployeeId(event.target.value);
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              {employeesQuery.data?.data.map((employee) => (
                <MenuItem key={employee.id} value={employee.id}>
                  {employee.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem>
          <FormControl fullWidth>
            <InputLabel id="attendance-store-filter">Tienda</InputLabel>
            <Select
              labelId="attendance-store-filter"
              label="Tienda"
              value={storeId}
              onChange={(event) => {
                pagination.resetPage();
                setStoreId(event.target.value);
              }}
            >
              <MenuItem value="">Todas</MenuItem>
              {storesQuery.data?.data.map((store) => (
                <MenuItem key={store.id} value={store.id}>
                  {store.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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

        <FilterItem size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <TextField
            label="Fecha desde"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              pagination.resetPage();
              setDateFrom(event.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
          <TextField
            label="Fecha hasta"
            type="date"
            value={dateTo}
            onChange={(event) => {
              pagination.resetPage();
              setDateTo(event.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
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
                  <TableCell>Fecha</TableCell>
                  <TableCell>Distancia</TableCell>
                  <TableCell>Validación</TableCell>
                  <TableCell>Ubicación</TableCell>
                  <TableCell>Puntualidad</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((record) => (
                  <TableRow key={record.id} hover>
                    <TableCell>{record.employee.name}</TableCell>
                    <TableCell>{record.store.name}</TableCell>
                    <TableCell>{formatDateTime(record.inventory.scheduledStart)}</TableCell>
                    <TableCell>{formatDateTime(record.receivedAt)}</TableCell>
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
                    <TableCell align="right">
                      <Button component={RouterLink} to={`/attendance/${record.id}`} size="small">
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
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
