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
import { StoreSearchAutocomplete } from "../../components/stores/StoreSearchAutocomplete";
import { useInventories } from "../../hooks/useInventories";
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

const INVENTORY_TABLE_COLUMNS: SortableColumn<InventoryListSortField>[] = [
  { id: "storeName", label: "Tienda" },
  { id: "storeAddress", label: "Dirección" },
  { id: "scheduledStart", label: "Inicio" },
  { id: "scheduledEnd", label: "Fin" },
  { id: "status", label: "Estado" },
  { id: "earlyToleranceMinutes", label: "Tolerancia temprana" },
  { id: "lateToleranceMinutes", label: "Tolerancia tardía" },
];

export function InventoriesListPage() {
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
        title="Inventarios"
        description="Planificá jornadas de inventario y asigná empleados."
        action={
          <Stack direction="row" spacing={1}>
            <Button component={RouterLink} to="/inventories/import" variant="outlined">
              Importar inventarios
            </Button>
            <PageHeaderLinkAction to="/inventories/new" label="Nuevo inventario" />
          </Stack>
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
          <StoreSearchAutocomplete
            value={storeId || null}
            onChange={(id) => {
              pagination.resetPage();
              setStoreId(id ?? "");
            }}
            allowCreate={false}
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
      {data && !isError && data.data.length === 0 ? <EmptyState title="No hay inventarios" /> : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Listado de inventarios">
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
                    ariaLabel={`Ver inventario de ${inventory.store.name}`}
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
