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
} from "@mui/material";
import { useCallback, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { SearchField } from "../../components/common/SearchField";
import { StatusChip } from "../../components/common/StatusChip";
import { usePaginationState } from "../../hooks/usePaginationState";
import { useDeactivateStore, useStores } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { Store } from "../../types/store";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";

export function StoresListPage() {
  const pagination = usePaginationState(10);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const { data, isPending, isError, error } = useStores({
    page: pagination.page,
    limit: pagination.pageSize,
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "true",
  });
  const deactivateMutation = useDeactivateStore();

  const handleSearch = useCallback((value: string) => {
    pagination.resetPage();
    setSearch(value);
  }, [pagination]);

  const handleDeactivate = async () => {
    if (!selectedStore) {
      return;
    }

    try {
      await deactivateMutation.mutateAsync(selectedStore.id);
      setFeedback({ open: true, message: "Tienda desactivada correctamente.", severity: "success" });
      setSelectedStore(null);
    } catch (mutationError) {
      setFeedback({
        open: true,
        message: getApiErrorMessage(mutationError, "No se pudo desactivar la tienda."),
        severity: "error",
      });
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Tiendas"
        description="Configurá ubicaciones y radios permitidos."
        action={<PageHeaderLinkAction to="/stores/new" label="Nueva tienda" />}
      />

      <ListFilters>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchField
            placeholder="Nombre o dirección"
            onSearch={handleSearch}
            fullWidth
          />
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="store-active-filter">Estado</InputLabel>
            <Select
              labelId="store-active-filter"
              label="Estado"
              value={activeFilter}
              onChange={(event) => {
                pagination.resetPage();
                setActiveFilter(event.target.value as "all" | "true" | "false");
              }}
            >
              <MenuItem value="all">Todas</MenuItem>
              <MenuItem value="true">Activas</MenuItem>
              <MenuItem value="false">Inactivas</MenuItem>
            </Select>
          </FormControl>
        </FilterItem>
      </ListFilters>

      {isPending ? <LoadingState /> : null}
      {isError ? <ErrorState message={getApiErrorMessage(error)} /> : null}
      {data && !isError && data.data.length === 0 ? <EmptyState title="No hay tiendas" /> : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Listado de tiendas">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Dirección</TableCell>
                  <TableCell>Latitud</TableCell>
                  <TableCell>Longitud</TableCell>
                  <TableCell>Radio permitido</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((store) => (
                  <TableRow key={store.id} hover>
                    <TableCell>{store.name}</TableCell>
                    <TableCell>{store.address ?? "—"}</TableCell>
                    <TableCell>{store.latitude}</TableCell>
                    <TableCell>{store.longitude}</TableCell>
                    <TableCell>{store.allowedRadiusMeters} m</TableCell>
                    <TableCell>
                      <StatusChip
                        label={activeStatusLabel(store.active)}
                        color={store.active ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button component={RouterLink} to={`/stores/${store.id}`} size="small">
                          Editar
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          disabled={!store.active}
                          onClick={() => setSelectedStore(store)}
                        >
                          Desactivar
                        </Button>
                      </Stack>
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

      <ConfirmDialog
        open={Boolean(selectedStore)}
        title="Desactivar tienda"
        description={`¿Confirmás desactivar ${selectedStore?.name ?? "esta tienda"}?`}
        confirmLabel="Desactivar"
        loading={deactivateMutation.isPending}
        onCancel={() => setSelectedStore(null)}
        onConfirm={handleDeactivate}
      />

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </AdminLayout>
  );
}
