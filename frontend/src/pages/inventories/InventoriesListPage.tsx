import { Button, Group, Select } from "@mantine/core";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
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
import { useInventories } from "../../hooks/useInventories";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import { useTableSort } from "../../hooks/useTableSort";
import type { InventoryListSortField, InventoryStatus, InventoryWithStore } from "../../types/inventory";
import type { DateRangeValue } from "../../types/date-range";
import { terminology } from "../../domain/terminology";
import { getDefaultInventoryDateRange, getDateRangeQueryValue } from "../../utils/date-range";
import {
  dateInputToIsoEnd,
  dateInputToIsoStart,
  formatDateTime,
} from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { inventoryStatusLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function InventoriesListPage() {
  const navigate = useNavigate();
  const permissionsQuery = useCompanyPermissions();
  const canManageInventories = hasPermission(
    permissionsQuery.data?.permissions,
    "inventories:manage",
  );

  const pagination = usePaginationState(10);
  const { resetPage, page, pageSize, onPageChange, onPageSizeChange } = pagination;
  const { sortBy, sortDirection, onSortChange } = useTableSort<InventoryListSortField>(
    "scheduledStart",
    "asc",
  );
  const [status, setStatus] = useState<InventoryStatus | "">("");
  const [storeId, setStoreId] = useState("");
  const [defaultDateRange] = useState<DateRangeValue>(() => getDefaultInventoryDateRange());
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => defaultDateRange);
  const dateQuery = getDateRangeQueryValue(dateRange);

  const { data, isPending, isError, error } = useInventories({
    page,
    limit: pageSize,
    status: status || undefined,
    storeId: storeId || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
    sortBy,
    sortDirection,
  });

  const handleSortChange = (field: string) => {
    resetPage();
    onSortChange(field as InventoryListSortField);
  };

  const handleDateRangeChange = (nextDateRange: DateRangeValue) => {
    resetPage();
    setDateRange(nextDateRange);
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
        getValue: (row) => row.store.name,
      },
      {
        key: "storeAddress",
        header: "Dirección",
        sortable: true,
        getValue: (row) => row.store.address ?? "—",
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
              <Button component={Link} to="/inventories/import" variant="default">
                {`Importar ${terminology.operation.plural.toLowerCase()}`}
              </Button>
              <Button component={Link} to="/inventories/new">
                {`Nueva ${terminology.operation.singular.toLowerCase()}`}
              </Button>
            </Group>
          ) : undefined
        }
      />

      <FilterBar>
        <FilterBar.Item>
          <Select
            label="Estado"
            value={status}
            onChange={(value) => {
              resetPage();
              setStatus((value ?? "") as InventoryStatus | "");
            }}
            data={statusOptions}
          />
        </FilterBar.Item>

        <FilterBar.Item>
          <StoreLookupAutocomplete
            value={storeId || null}
            onChange={(id) => {
              resetPage();
              setStoreId(id ?? "");
            }}
          />
        </FilterBar.Item>

        <FilterBar.Item minWidth={280}>
          <DateRangeFilter
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
        onRowClick={(row) => navigate(`/inventories/${row.id}`)}
        aria-label={`Listado de ${terminology.operation.plural.toLowerCase()}`}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
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
