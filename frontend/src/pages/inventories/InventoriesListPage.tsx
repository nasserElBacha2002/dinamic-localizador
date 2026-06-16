import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { useInventories } from "../../hooks/useInventories";
import { useStores } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { InventoryStatus } from "../../types/inventory";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { inventoryStatusLabels } from "../../utils/labels";

export function InventoriesListPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InventoryStatus | "">("");
  const [storeId, setStoreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const storesQuery = useStores({ page: 1, limit: 100, active: true });
  const { data, isPending, isError, error } = useInventories({
    page,
    limit: 10,
    status: status || undefined,
    storeId: storeId || undefined,
    dateFrom: dateFrom ? dateInputToIsoStart(dateFrom) : undefined,
    dateTo: dateTo ? dateInputToIsoEnd(dateTo) : undefined,
  });

  return (
    <AdminLayout>
      <PageHeader
        title="Inventarios"
        description="Planificá jornadas de inventario y asigná empleados."
        action={<PageHeaderLinkAction to="/inventories/new" label="Nuevo inventario" />}
      />

      <ListFilters>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="inventory-status-filter">Estado</InputLabel>
            <Select
              labelId="inventory-status-filter"
              label="Estado"
              value={status}
              onChange={(event) => {
                setPage(1);
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

        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="inventory-store-filter">Tienda</InputLabel>
            <Select
              labelId="inventory-store-filter"
              label="Tienda"
              value={storeId}
              onChange={(event) => {
                setPage(1);
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

        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField
            label="Fecha desde"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setPage(1);
              setDateFrom(event.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <TextField
            label="Fecha hasta"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setPage(1);
              setDateTo(event.target.value);
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
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
              <TableHead>
                <TableRow>
                  <TableCell>Tienda</TableCell>
                  <TableCell>Inicio</TableCell>
                  <TableCell>Fin</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Tolerancia temprana</TableCell>
                  <TableCell>Tolerancia tardía</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((inventory) => (
                  <TableRow key={inventory.id} hover>
                    <TableCell>{inventory.store.name}</TableCell>
                    <TableCell>{formatDateTime(inventory.scheduledStart)}</TableCell>
                    <TableCell>{formatDateTime(inventory.scheduledEnd)}</TableCell>
                    <TableCell>
                      <StatusChip label={inventoryStatusLabels[inventory.status]} />
                    </TableCell>
                    <TableCell>{inventory.earlyToleranceMinutes} min</TableCell>
                    <TableCell>{inventory.lateToleranceMinutes} min</TableCell>
                    <TableCell align="right">
                      <Button component={RouterLink} to={`/inventories/${inventory.id}`} size="small">
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <PaginationControls meta={data.meta} onPageChange={setPage} />
        </>
      ) : null}
    </AdminLayout>
  );
}
