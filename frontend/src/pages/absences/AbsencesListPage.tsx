import {
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
} from "@mui/material";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClickableTableRow } from "../../components/common/ClickableTableRow";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { StatusChip } from "../../components/common/StatusChip";
import { EmployeeSearchAutocomplete } from "../../components/employees/EmployeeSearchAutocomplete";
import { useAbsenceRequests, useAbsenceTypes } from "../../hooks/useAbsences";
import { usePaginationState } from "../../hooks/usePaginationState";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { AbsenceRequestStatus } from "../../types/absence";
import type { DateRangeValue } from "../../types/date-range";
import { EMPTY_DATE_RANGE_VALUE, getDateRangeQueryValue } from "../../utils/date-range";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  absenceRequestedViaLabels,
  absenceStatusLabels,
  absenceTypeLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";

export function AbsencesListPage() {
  const [searchParams] = useSearchParams();
  const pagination = usePaginationState(10);
  const [status, setStatus] = useState<AbsenceRequestStatus | "">("PENDING");
  const [absenceTypeId, setAbsenceTypeId] = useState("");
  const [employeeId, setEmployeeId] = useState(searchParams.get("employeeId") ?? "");
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const from = searchParams.get("dateFrom");
    const to = searchParams.get("dateTo");
    if (from || to) {
      return { preset: "custom", from, to };
    }
    return EMPTY_DATE_RANGE_VALUE;
  });

  const typesQuery = useAbsenceTypes();
  const dateQuery = getDateRangeQueryValue(dateRange);
  const { data, isPending, isError, error } = useAbsenceRequests({
    page: pagination.page,
    limit: pagination.pageSize,
    status: status || undefined,
    absenceTypeId: absenceTypeId || undefined,
    employeeId: employeeId || undefined,
    dateFrom: dateQuery.from,
    dateTo: dateQuery.to,
  });

  return (
    <AdminLayout>
      <PageHeader
        title="Solicitudes de ausencia"
        description="Revisá y gestioná las solicitudes enviadas por WhatsApp o administración."
      />

      <ListFilters>
        <FilterItem>
          <FormControl fullWidth size="small">
            <InputLabel id="absence-status-filter">Estado</InputLabel>
            <Select
              labelId="absence-status-filter"
              label="Estado"
              value={status}
              onChange={(event) => {
                pagination.resetPage();
                setStatus(event.target.value as AbsenceRequestStatus | "");
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(absenceStatusLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>
        <FilterItem>
          <FormControl fullWidth size="small">
            <InputLabel id="absence-type-filter">Tipo</InputLabel>
            <Select
              labelId="absence-type-filter"
              label="Tipo"
              value={absenceTypeId}
              onChange={(event) => {
                pagination.resetPage();
                setAbsenceTypeId(event.target.value);
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              {(typesQuery.data ?? []).map((type) => (
                <MenuItem key={type.id} value={type.id}>
                  {absenceTypeLabels[type.code as keyof typeof absenceTypeLabels] ?? type.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>
        <FilterItem>
          <EmployeeSearchAutocomplete
            value={employeeId || null}
            onChange={(value) => {
              pagination.resetPage();
              setEmployeeId(value ?? "");
            }}
            label="Empleado"
          />
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 12, md: 6, lg: 4 }}>
          <DateRangeFilter
            value={dateRange}
            onChange={(nextDateRange) => {
              pagination.resetPage();
              setDateRange(nextDateRange);
            }}
            mode="mixed"
            label="Fecha"
            allowCustomRange
          />
        </FilterItem>
      </ListFilters>

      {isPending ? <LoadingState /> : null}
      {isError ? <ErrorState message={getApiErrorMessage(error)} /> : null}

      {!isPending && !isError && data && data.data.length === 0 ? (
        <EmptyState title="No hay solicitudes de ausencia para los filtros seleccionados." />
      ) : null}

      {!isPending && !isError && data && data.data.length > 0 ? (
        <Stack spacing={2}>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Empleado</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Inicio</TableCell>
                  <TableCell>Fin</TableCell>
                  <TableCell>Días</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Origen</TableCell>
                  <TableCell>Creada</TableCell>
                  <TableCell>Inventarios afectados</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((request) => (
                  <ClickableTableRow
                    key={request.id}
                    to={`/absences/${request.id}`}
                    ariaLabel={`Ver solicitud de ${request.employee.name}`}
                  >
                    <TableCell>{request.employee.name}</TableCell>
                    <TableCell>
                      {absenceTypeLabels[request.absenceType.code as keyof typeof absenceTypeLabels] ??
                        request.absenceType.name}
                    </TableCell>
                    <TableCell>{formatAbsenceDate(request.startDate)}</TableCell>
                    <TableCell>{formatAbsenceDate(request.endDate)}</TableCell>
                    <TableCell>{request.totalDays}</TableCell>
                    <TableCell>
                      <StatusChip label={absenceStatusLabels[request.status]} />
                    </TableCell>
                    <TableCell>{absenceRequestedViaLabels[request.requestedVia]}</TableCell>
                    <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                    <TableCell>{request.affectedInventoriesCount}</TableCell>
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
        </Stack>
      ) : null}
    </AdminLayout>
  );
}
