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
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ClickableTableRow } from "../../components/common/ClickableTableRow";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import type { SortableColumn } from "../../components/common/SortableTableHead";
import { SortableTableHead } from "../../components/common/SortableTableHead";
import { StatusChip } from "../../components/common/StatusChip";
import { StoreLookupAutocomplete } from "../../components/lookups/StoreLookupAutocomplete";
import { useInventories } from "../../hooks/useInventories";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import { useTableSort } from "../../hooks/useTableSort";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { InventoryListSortField, InventoryStatus } from "../../types/inventory";
import type { DateRangeValue } from "../../types/date-range";
import { getDefaultInventoryDateRange, getDateRangeQueryValue } from "../../utils/date-range";
import {
  dateInputToIsoEnd,
  dateInputToIsoStart,
  formatDateTime,
} from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { inventoryStatusLabels } from "../../utils/labels";
import { terminology } from "../../domain/terminology";
import { hasPermission } from "../../utils/permissions";

const INVENTORY_TABLE_COLUMNS: SortableColumn<InventoryListSortField>[] = [
  { id: "storeName", label: terminology.location.singular },
  { id: "storeAddress", label: "Dirección" },
  { id: "scheduledStart", label: "Inicio" },
  { id: "scheduledEnd", label: "Fin" },
  { id: "status", label: "Estado" },
  { id: "earlyToleranceMinutes", label: "Tolerancia temprana" },
  { id: "lateToleranceMinutes", label: "Tolerancia tardía" },
];

export function InventoriesListPage() {
  const permissionsQuery = useCompanyPermissions();
  const canManageInventories = hasPermission(
    permissionsQuery.data?.permissions,
    "inventories:manage",
  );

  const pagination = usePaginationState(10);
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
    page: pagination.page,
    limit: pagination.pageSize,
    status: status || undefined,
    storeId: storeId || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
    sortBy,
    sortDirection,
  });

  const handleSortChange = (field: InventoryListSortField) => {
    pagination.resetPage();
    onSortChange(field);
  };

  const handleDateRangeChange = (nextDateRange: DateRangeValue) => {
    pagination.resetPage();
    setDateRange(nextDateRange);
  };

  return (
    <AdminLayout>
      <PageHeader
        title={terminology.operation.plural}
        description={`Planificá ${terminology.operation.plural.toLowerCase()} y asigná ${terminology.worker.plural.toLowerCase()}.`}
        action={
          canManageInventories ? (
            <Stack direction="row" spacing={1}>
              <Button component={RouterLink} to="/inventories/import" variant="outlined">
                {`Importar ${terminology.operation.plural.toLowerCase()}`}
              </Button>
              <PageHeaderLinkAction
                to="/inventories/new"
                label={`Nueva ${terminology.operation.singular.toLowerCase()}`}
              />
            </Stack>
          ) : undefined
        }
      />

      <ListFilters>
        <FilterItem size={{ xs: 12, sm: 6, md: 3 }}>
          <FormControl fullWidth>
            <InputLabel id="inventory-status-filter">Estado</InputLabel>
            <Select
              labelId="inventory-status-filter"
              label="Estado"
              value={status}
              onChange={(event) => {
                pagination.resetPage();
                setStatus(event.target.value as InventoryStatus | "");
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              {Object.entries(inventoryStatusLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>

        <FilterItem size={{ xs: 12, sm: 6, md: 3 }}>
          <StoreLookupAutocomplete
            value={storeId || null}
            onChange={(id) => {
              pagination.resetPage();
              setStoreId(id ?? "");
            }}
          />
        </FilterItem>

        <FilterItem size={{ xs: 12, sm: 12, md: 6, lg: 4 }}>
          <DateRangeFilter
            value={dateRange}
            onChange={handleDateRangeChange}
            mode="future"
            label="Fecha"
            defaultValue={defaultDateRange}
            allowCustomRange
          />
        </FilterItem>
      </ListFilters>

      {isPending ? <LoadingState /> : null}
      {isError ? <ErrorState message={getApiErrorMessage(error)} /> : null}
      {data && !isError && data.data.length === 0 ? (
        <EmptyState title={`No hay ${terminology.operation.plural.toLowerCase()}`} />
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={`Listado de ${terminology.operation.plural.toLowerCase()}`}>
              <SortableTableHead
                columns={INVENTORY_TABLE_COLUMNS}
                sortBy={sortBy}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
              />
              <TableBody>
                {data.data.map((inventory) => (
                  <ClickableTableRow
                    key={inventory.id}
                    to={`/inventories/${inventory.id}`}
                    ariaLabel={`Ver ${terminology.operation.singular.toLowerCase()} de ${inventory.store.name}`}
                  >
                    <TableCell>{inventory.store.name}</TableCell>
                    <TableCell>{inventory.store.address ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(inventory.scheduledStart)}</TableCell>
                    <TableCell>{formatDateTime(inventory.scheduledEnd)}</TableCell>
                    <TableCell>
                      <StatusChip label={inventoryStatusLabels[inventory.status]} />
                    </TableCell>
                    <TableCell>{inventory.earlyToleranceMinutes} min</TableCell>
                    <TableCell>{inventory.lateToleranceMinutes} min</TableCell>
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
