import {
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
} from "@mui/material";
import { useCallback, useState } from "react";
import { ClickableTableRow } from "../../components/common/ClickableTableRow";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader, PageHeaderLinkAction } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { SearchField } from "../../components/common/SearchField";
import { StatusChip } from "../../components/common/StatusChip";
import { usePaginationState } from "../../hooks/usePaginationState";
import { useStores } from "../../hooks/useStores";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { AdminLayout } from "../../layouts/AdminLayout";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function StoresListPage() {
  const permissionsQuery = useCompanyPermissions();
  const canManageStores = hasPermission(permissionsQuery.data?.permissions, "stores:manage");
  const pagination = usePaginationState(10);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");

  const { data, isPending, isError, error } = useStores({
    page: pagination.page,
    limit: pagination.pageSize,
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "true",
  });

  const handleSearch = useCallback((value: string) => {
    pagination.resetPage();
    setSearch(value);
  }, [pagination]);

  return (
    <AdminLayout>
      <PageHeader
        title={terminology.location.plural}
        description="Configurá ubicaciones y radios permitidos."
        action={
          canManageStores ? (
            <PageHeaderLinkAction
              to="/stores/new"
              label={`Nueva ${terminology.location.singular.toLowerCase()}`}
            />
          ) : undefined
        }
      />

      <ListFilters>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchField
            placeholder="Nombre, dirección, barrio o localidad"
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
      {data && !isError && data.data.length === 0 ? (
        <EmptyState title={`No hay ${terminology.location.plural.toLowerCase()}`} />
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label={`Listado de ${terminology.location.plural.toLowerCase()}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Barrio</TableCell>
                  <TableCell>Localidad</TableCell>
                  <TableCell>Formato</TableCell>
                  <TableCell>Dirección</TableCell>
                  <TableCell>Latitud</TableCell>
                  <TableCell>Longitud</TableCell>
                  <TableCell>Radio permitido</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.data.map((store) => (
                  <ClickableTableRow
                    key={store.id}
                    to={`/stores/${store.id}`}
                    ariaLabel={`Ver ${terminology.location.singular.toLowerCase()} ${store.name}`}
                  >
                    <TableCell>{store.name}</TableCell>
                    <TableCell>{store.neighborhood ?? "—"}</TableCell>
                    <TableCell>{store.locality ?? "—"}</TableCell>
                    <TableCell>{store.storeFormat ?? "—"}</TableCell>
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
