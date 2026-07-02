import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmployeeSearchAutocomplete } from "../../components/employees/EmployeeSearchAutocomplete";
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
import { useAbsenceRequests, useAbsenceTypes } from "../../hooks/useAbsences";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { AbsenceRequestListItem, AbsenceRequestStatus } from "../../types/absence";
import type { DateRangeValue } from "../../types/date-range";
import { terminology } from "../../domain/terminology";
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pagination = usePaginationState(10);
  const { resetPage, page, pageSize, onPageChange, onPageSizeChange } = pagination;
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
    page,
    limit: pageSize,
    status: status || undefined,
    absenceTypeId: absenceTypeId || undefined,
    employeeId: employeeId || undefined,
    dateFrom: dateQuery.from,
    dateTo: dateQuery.to,
  });

  const statusOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...Object.entries(absenceStatusLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const typeOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(typesQuery.data ?? []).map((type) => ({
        value: type.id,
        label: absenceTypeLabels[type.code as keyof typeof absenceTypeLabels] ?? type.name,
      })),
    ],
    [typesQuery.data],
  );

  const columns = useMemo<DataTableColumn<AbsenceRequestListItem>[]>(
    () => [
      { key: "employee", header: terminology.worker.singular, getValue: (row) => row.employee.name },
      {
        key: "type",
        header: "Tipo",
        getValue: (row) =>
          absenceTypeLabels[row.absenceType.code as keyof typeof absenceTypeLabels] ??
          row.absenceType.name,
      },
      { key: "startDate", header: "Inicio", getValue: (row) => formatAbsenceDate(row.startDate) },
      { key: "endDate", header: "Fin", getValue: (row) => formatAbsenceDate(row.endDate) },
      { key: "totalDays", header: "Días", getValue: (row) => row.totalDays },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge label={absenceStatusLabels[row.status]} tone="neutral" variant="light" />
        ),
      },
      {
        key: "requestedVia",
        header: "Origen",
        getValue: (row) => absenceRequestedViaLabels[row.requestedVia],
      },
      { key: "createdAt", header: "Creada", getValue: (row) => formatDateTime(row.createdAt) },
      {
        key: "affectedInventories",
        header: `${terminology.operation.plural} afectadas`,
        getValue: (row) => row.affectedInventoriesCount,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Solicitudes de ausencia"
        description="Revisá y gestioná las solicitudes enviadas por WhatsApp o administración."
      />

      <FilterBar>
        <FilterBar.Item>
          <FilterSelect
            label="Estado"
            value={status}
            onChange={(nextValue) => {
              resetPage();
              setStatus(nextValue as AbsenceRequestStatus | "");
            }}
            data={statusOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Tipo"
            value={absenceTypeId}
            onChange={(nextValue) => {
              resetPage();
              setAbsenceTypeId(nextValue);
            }}
            data={typeOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <EmployeeSearchAutocomplete
            value={employeeId || null}
            onChange={(value) => {
              resetPage();
              setEmployeeId(value ?? "");
            }}
            label={terminology.worker.singular}
          />
        </FilterBar.Item>
        <FilterBar.Item minWidth={280}>
          <FilterDateRangeInput
            value={dateRange}
            onChange={(nextDateRange) => {
              resetPage();
              setDateRange(nextDateRange);
            }}
            mode="mixed"
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
        emptyTitle="No hay solicitudes de ausencia para los filtros seleccionados."
        emptyDescription="Ajustá los filtros o esperá nuevas solicitudes."
        onRowClick={(row) => navigate(`/absences/${row.id}`)}
        aria-label="Listado de solicitudes de ausencia"
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
