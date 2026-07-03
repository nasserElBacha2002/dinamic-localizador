import { Button, Group } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { useInventories } from "../../hooks/useInventories";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { InventoryListSortField, InventoryStatus, InventoryWithStore } from "../../types/inventory";
import type { DateRangeValue } from "../../types/date-range";
import { terminology } from "../../domain/terminology";
import { getDefaultInventoryDateRange, getDateRangeQueryValue } from "../../utils/date-range";
import { dateRangeToUrlFields, urlFieldsToDateRange } from "../../utils/date-range-url";
import {
  dateInputToIsoEnd,
  dateInputToIsoStart,
  formatDateTime,
} from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { navigateWithListContext } from "../../utils/list-navigation";
import { getInventoryStoreAddress, getInventoryStoreName } from "./inventories-list-columns";
import { inventoryStatusLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import {
  buildInventoryTableDefaults,
  INVENTORY_TABLE_FIELDS,
  shouldOmitInventoryTableValue,
} from "./inventories-list-table-state";

const INVENTORIES_LIST_PATH = "/inventories";

export function InventoriesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const listNav = useListNavigationState(INVENTORIES_LIST_PATH);
  const permissionsQuery = useCompanyPermissions();
  const canManageInventories = hasPermission(
    permissionsQuery.data?.permissions,
    "inventories:manage",
  );
  const [defaultDateRange] = useState<DateRangeValue>(() => getDefaultInventoryDateRange());
  const defaultDateFields = useMemo(
    () => dateRangeToUrlFields(defaultDateRange),
    [defaultDateRange],
  );
  const tableDefaults = useMemo(
    () => buildInventoryTableDefaults(defaultDateFields),
    [defaultDateFields],
  );
  const shouldOmitFromUrl = useCallback(
    (
      key: keyof typeof tableDefaults,
      value: (typeof tableDefaults)[keyof typeof tableDefaults],
      defaults: typeof tableDefaults,
      state: typeof tableDefaults,
    ) => shouldOmitInventoryTableValue(key, value, defaults, state, defaultDateFields),
    [defaultDateFields],
  );

  const table = useTableUrlState({
    defaults: tableDefaults,
    fields: INVENTORY_TABLE_FIELDS,
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

  const { data, isPending, isError, error } = useInventories({
    page: table.page,
    limit: table.pageSize,
    status: (table.state.status || undefined) as InventoryStatus | undefined,
    storeId: table.state.storeId || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
    sortBy: table.state.sortBy as InventoryListSortField,
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
      ...Object.entries(inventoryStatusLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const columns = useMemo<DataTableColumn<InventoryWithStore>[]>(
    () => [
      {
        key: "storeName",
        header: terminology.location.singular,
        sortable: true,
        getValue: (row) => getInventoryStoreName(row),
      },
      {
        key: "storeAddress",
        header: "Dirección",
        sortable: true,
        getValue: (row) => getInventoryStoreAddress(row),
      },
      {
        key: "scheduledStart",
        header: "Inicio",
        sortable: true,
        getValue: (row) => formatDateTime(row.scheduledStart),
      },
      {
        key: "scheduledEnd",
        header: "Fin",
        sortable: true,
        getValue: (row) => formatDateTime(row.scheduledEnd),
      },
      {
        key: "status",
        header: "Estado",
        sortable: true,
        render: (row) => (
          <StatusBadge label={inventoryStatusLabels[row.status]} tone="info" variant="light" />
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
          canManageInventories ? (
            <Group gap="xs">
              <Button component={Link} to="/inventories/import" state={listNav} variant="default">
                {`Importar ${terminology.operation.plural.toLowerCase()}`}
              </Button>
              <Button component={Link} to="/inventories/new" state={listNav}>
                {`Nueva ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            </Group>
          ) : undefined
        }
      />

      <FilterBar>
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
          <StoreLookupAutocomplete
            value={table.state.storeId || null}
            onChange={(id) => {
              table.setField("storeId", id ?? "");
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
          navigateWithListContext(navigate, `/inventories/${row.id}`, INVENTORIES_LIST_PATH, location)
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
