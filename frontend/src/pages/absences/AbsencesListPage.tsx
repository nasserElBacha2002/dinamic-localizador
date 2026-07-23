import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useAbsenceRequests, useAbsenceTypes } from "../../hooks/useAbsences";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { AbsenceRequestListItem, AbsenceRequestStatus } from "../../types/absence";
import { terminology } from "../../domain/terminology";
import { getDateRangeQueryValue } from "../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../utils/date-range-url";
import { formatDateTime } from "../../utils/dates";
import { getRelatedName, safeText } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import { navigateWithListContext } from "../../utils/list-navigation";
import {
  absenceRequestedViaLabels,
  absenceStatusLabels,
  absenceTypeLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";
import {
  ABSENCES_TABLE_DEFAULTS,
  ABSENCES_TABLE_FIELDS,
  shouldOmitAbsencesTableValue,
} from "./absences-list-table-state";

const ABSENCES_LIST_PATH = "/absences";

export function AbsencesListPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const table = useTableUrlState({
    defaults: ABSENCES_TABLE_DEFAULTS,
    fields: ABSENCES_TABLE_FIELDS,
    shouldOmitFromUrl: shouldOmitAbsencesTableValue,
  });

  const typesQuery = useAbsenceTypes();
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
  const apiStatus =
    table.state.status === "all" ? undefined : (table.state.status as AbsenceRequestStatus);

  const { data, isPending, isError, error } = useAbsenceRequests({
    page: table.page,
    limit: table.pageSize,
    status: apiStatus,
    absenceTypeId: table.state.absenceTypeId || undefined,
    employeeId: table.state.employeeId || undefined,
    dateFrom: dateQuery.from,
    dateTo: dateQuery.to,
  });

  const activeSecondaryFilterCount = useMemo(() => {
    let count = 0;
    if (table.state.status !== ABSENCES_TABLE_DEFAULTS.status) count += 1;
    if (table.state.absenceTypeId !== ABSENCES_TABLE_DEFAULTS.absenceTypeId) count += 1;
    if (table.state.employeeId !== ABSENCES_TABLE_DEFAULTS.employeeId) count += 1;
    return count;
  }, [table.state]);

  const handleClearSecondaryFilters = useCallback(() => {
    table.setState({
      status: ABSENCES_TABLE_DEFAULTS.status,
      absenceTypeId: ABSENCES_TABLE_DEFAULTS.absenceTypeId,
      employeeId: ABSENCES_TABLE_DEFAULTS.employeeId,
    });
  }, [table]);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "Todos" },
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
      {
        key: "employee",
        header: terminology.worker.singular,
        getValue: (row) => getRelatedName(row.employee),
      },
      {
        key: "type",
        header: "Tipo",
        getValue: (row) =>
          absenceTypeLabels[row.absenceType?.code as keyof typeof absenceTypeLabels] ??
          safeText(row.absenceType?.name ?? null),
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
        key: "affectedOperations",
        header: `${terminology.operation.plural} afectadas`,
        getValue: (row) => row.affectedOperationsCount,
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<AbsenceRequestListItem>>(
    () => ({
      title: (row) => getRelatedName(row.employee),
      status: (row) => (
        <StatusBadge label={absenceStatusLabels[row.status]} tone="neutral" variant="light" />
      ),
      fields: [
        {
          key: "type",
          label: "Tipo",
          getValue: (row) =>
            absenceTypeLabels[row.absenceType?.code as keyof typeof absenceTypeLabels] ??
            safeText(row.absenceType?.name ?? null),
          visibility: "always",
        },
        {
          key: "period",
          label: "Período",
          getValue: (row) =>
            `${formatAbsenceDate(row.startDate)} – ${formatAbsenceDate(row.endDate)}`,
          visibility: "always",
        },
        {
          key: "totalDays",
          label: "Días",
          getValue: (row) => String(row.totalDays),
          visibility: "always",
        },
        {
          key: "requestedVia",
          label: "Origen",
          getValue: (row) => absenceRequestedViaLabels[row.requestedVia],
          visibility: "expanded",
        },
        {
          key: "createdAt",
          label: "Creada",
          getValue: (row) => formatDateTime(row.createdAt),
          visibility: "expanded",
        },
        {
          key: "affectedOperations",
          label: `${terminology.operation.plural} afectadas`,
          getValue: (row) => String(row.affectedOperationsCount),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <PageHeader
        title="Solicitudes de ausencia"
        description="Revisá y gestioná las solicitudes enviadas por WhatsApp o administración."
      />

      <FilterBar
        search={
          <FilterDateRangeInput
            value={dateRange}
            onChange={(nextDateRange) => {
              table.setState(dateRangeToUrlFields(nextDateRange));
            }}
            mode="mixed"
            label="Fecha"
            allowCustomRange
          />
        }
        activeFilterCount={activeSecondaryFilterCount}
        onClearFilters={handleClearSecondaryFilters}
      >
        <FilterBar.Item>
          <FilterSelect
            label="Estado"
            value={table.state.status}
            onChange={(nextValue) => {
              table.setField("status", nextValue);
            }}
            data={statusOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Tipo"
            value={table.state.absenceTypeId}
            onChange={(nextValue) => {
              table.setField("absenceTypeId", nextValue);
            }}
            data={typeOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <EmployeeSearchAutocomplete
            value={table.state.employeeId || null}
            onChange={(value) => {
              table.setField("employeeId", value ?? "");
            }}
            label={terminology.worker.singular}
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
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/absences/${row.id}`, ABSENCES_LIST_PATH, location)
        }
        mobileView="cards"
        mobileCard={mobileCard}
        aria-label="Listado de solicitudes de ausencia"
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
