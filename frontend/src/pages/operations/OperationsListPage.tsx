import { Button, Group } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ServiceLookupAutocomplete } from "../../components/lookups/ServiceLookupAutocomplete";
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
import { useOperations } from "../../hooks/useOperations";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { OperationKind, OperationListSortField, OperationStatus, OperationWithService } from "../../types/operation";
import type { DateRangeValue } from "../../types/date-range";
import { terminology } from "../../domain/terminology";
import { getDefaultOperationDateRange, getDateRangeQueryValue } from "../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../utils/date-range-url";
import {
  dateInputToIsoEnd,
  dateInputToIsoStart,
} from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { navigateWithListContext } from "../../utils/list-navigation";
import { formatOperationScheduleListLabel, operationKindLabels } from "../../utils/operation-schedule-display";
import { getOperationServiceAddress, getOperationServiceName } from "./operations-list-columns";
import { operationStatusLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import {
  buildOperationTableDefaults,
  OPERATION_TABLE_FIELDS,
  shouldOmitOperationTableValue,
} from "./operations-list-table-state";

const OPERATIONS_LIST_PATH = "/operations";

export function OperationsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const listNav = useListNavigationState(OPERATIONS_LIST_PATH);
  const permissionsQuery = useCompanyPermissions();
  const canManageOperations = hasPermission(
    permissionsQuery.data?.permissions,
    "operations:manage",
  );
  const [defaultDateRange] = useState<DateRangeValue>(() => getDefaultOperationDateRange());
  const defaultDateFields = useMemo(
    () => dateRangeToUrlFields(defaultDateRange),
    [defaultDateRange],
  );
  const tableDefaults = useMemo(
    () => buildOperationTableDefaults(defaultDateFields),
    [defaultDateFields],
  );
  const shouldOmitFromUrl = useCallback(
    (
      key: keyof typeof tableDefaults,
      value: (typeof tableDefaults)[keyof typeof tableDefaults],
      defaults: typeof tableDefaults,
      state: typeof tableDefaults,
    ) => shouldOmitOperationTableValue(key, value, defaults, state, defaultDateFields),
    [defaultDateFields],
  );

  const table = useTableUrlState({
    defaults: tableDefaults,
    fields: OPERATION_TABLE_FIELDS,
    shouldOmitFromUrl,
  });

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

  const { data, isPending, isError, error } = useOperations({
    page: table.page,
    limit: table.pageSize,
    status: (table.state.status || undefined) as OperationStatus | undefined,
    operationKind: (table.state.operationKind || undefined) as OperationKind | undefined,
    serviceId: table.state.serviceId || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
    sortBy: table.state.sortBy as OperationListSortField,
    sortDirection: table.state.sortOrder,
  });

  const handleSortChange = (field: string) => {
    table.toggleSorting(field, "asc");
  };

  const handleDateRangeChange = (nextDateRange: DateRangeValue) => {
    table.setState(dateRangeToUrlFields(nextDateRange));
  };

  const statusOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...Object.entries(operationStatusLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const operationKindOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      { value: "ONE_TIME", label: operationKindLabels.ONE_TIME },
      { value: "RECURRING", label: operationKindLabels.RECURRING },
    ],
    [],
  );

  const columns = useMemo<DataTableColumn<OperationWithService>[]>(
    () => [
      {
        key: "serviceName",
        header: terminology.service.singular,
        sortable: true,
        getValue: (row) => getOperationServiceName(row),
      },
      {
        key: "serviceAddress",
        header: "Dirección",
        sortable: true,
        getValue: (row) => getOperationServiceAddress(row),
      },
      {
        key: "scheduledStart",
        header: "Programación",
        sortable: true,
        getValue: (row) =>
          formatOperationScheduleListLabel(
            row.operationKind ?? "ONE_TIME",
            row.scheduledStart,
            row.scheduledEnd,
            row.scheduleSummary,
          ),
      },
      {
        key: "status",
        header: "Estado",
        sortable: true,
        render: (row) => (
          <StatusBadge label={operationStatusLabels[row.status]} tone="info" variant="light" />
        ),
      },
      {
        key: "earlyToleranceMinutes",
        header: "Tolerancia temprana",
        sortable: true,
        getValue: (row) => `${row.earlyToleranceMinutes} min`,
      },
      {
        key: "lateToleranceMinutes",
        header: "Tolerancia tardía",
        sortable: true,
        getValue: (row) => `${row.lateToleranceMinutes} min`,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title={terminology.operation.plural}
        description={`Planificá ${terminology.operation.plural.toLowerCase()} y asigná ${terminology.worker.plural.toLowerCase()}.`}
        action={
          canManageOperations ? (
            <Group gap="xs">
              <Button component={Link} to="/imports?entity=operations" state={listNav} variant="default">
                {`Importar ${terminology.operation.plural.toLowerCase()}`}
              </Button>
              <Button component={Link} to="/operations/new" state={listNav}>
                {`Nueva ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            </Group>
          ) : undefined
        }
      />

      <FilterBar>
        <FilterBar.Item>
          <FilterSelect
            label="Tipo de operación"
            value={table.state.operationKind}
            onChange={(nextValue) => {
              table.setField("operationKind", nextValue);
            }}
            data={operationKindOptions}
          />
        </FilterBar.Item>

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
          <ServiceLookupAutocomplete
            value={table.state.serviceId || null}
            onChange={(id) => {
              table.setField("serviceId", id ?? "");
            }}
          />
        </FilterBar.Item>

        <FilterBar.Item minWidth={280}>
          <FilterDateRangeInput
            value={dateRange}
            onChange={handleDateRangeChange}
            mode="future"
            label="Fecha"
            defaultValue={defaultDateRange}
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
        emptyTitle={`No hay ${terminology.operation.plural.toLowerCase()}`}
        emptyDescription={`Creá la primera ${terminology.operation.singular.toLowerCase()} para comenzar.`}
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/operations/${row.id}`, OPERATIONS_LIST_PATH, location)
        }
        aria-label={`Listado de ${terminology.operation.plural.toLowerCase()}`}
        sortBy={table.state.sortBy}
        sortDirection={table.state.sortOrder}
        onSortChange={handleSortChange}
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
