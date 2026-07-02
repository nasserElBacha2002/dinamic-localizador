import { Button, Select } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DataTable,
  FilterBar,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { usePaginationState } from "../../hooks/usePaginationState";
import { useStores } from "../../hooks/useStores";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { terminology } from "../../domain/terminology";
import type { Store } from "../../types/store";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function StoresListPage() {
  const navigate = useNavigate();
  const permissionsQuery = useCompanyPermissions();
  const canManageStores = hasPermission(permissionsQuery.data?.permissions, "stores:manage");
  const pagination = usePaginationState(10);
  const { resetPage, page, pageSize, onPageChange, onPageSizeChange } = pagination;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");

  const handleSearch = useCallback(
    (value: string) => {
      resetPage();
      const nextSearch = value.trim();
      setSearchInput(nextSearch);
      setSearch(nextSearch);
    },
    [resetPage],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (!value) {
        resetPage();
        setSearch("");
      }
    },
    [resetPage],
  );

  const { data, isPending, isError, error } = useStores({
    page,
    limit: pageSize,
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "true",
  });

  const columns = useMemo<DataTableColumn<Store>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      { key: "neighborhood", header: "Barrio", getValue: (row) => row.neighborhood ?? "—" },
      { key: "locality", header: "Localidad", getValue: (row) => row.locality ?? "—" },
      { key: "storeFormat", header: "Formato", getValue: (row) => row.storeFormat ?? "—" },
      { key: "address", header: "Dirección", getValue: (row) => row.address ?? "—" },
      { key: "latitude", header: "Latitud", getValue: (row) => row.latitude },
      { key: "longitude", header: "Longitud", getValue: (row) => row.longitude },
      {
        key: "allowedRadiusMeters",
        header: "Radio permitido",
        getValue: (row) => `${row.allowedRadiusMeters} m`,
      },
      {
        key: "active",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={activeStatusLabel(row.active)}
            tone={row.active ? "success" : "neutral"}
          />
        ),
      },
    ],
    [],
  );

  const handleActiveFilterChange = useCallback(
    (value: string | null) => {
      if (!value) {
        return;
      }

      resetPage();
      setActiveFilter(value as "all" | "true" | "false");
    },
    [resetPage],
  );

  return (
    <>
      <PageHeader
        title={terminology.location.plural}
        description="Configurá ubicaciones y radios permitidos."
        action={
          canManageStores ? (
            <Button component={Link} to="/stores/new">
              {`Nueva ${terminology.location.singular.toLowerCase()}`}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <FilterBar.Item>
          <SearchInput
            value={searchInput}
            onChange={handleSearchChange}
            onSearch={handleSearch}
            placeholder="Nombre, dirección, barrio o localidad"
            label="Buscar"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <Select
            label="Estado"
            value={activeFilter}
            onChange={handleActiveFilterChange}
            data={[
              { value: "all", label: "Todas" },
              { value: "true", label: "Activas" },
              { value: "false", label: "Inactivas" },
            ]}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        rows={data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.id}
        loading={isPending}
        error={isError ? getApiErrorMessage(error) : undefined}
        emptyTitle={`No hay ${terminology.location.plural.toLowerCase()}`}
        emptyDescription={`Creá la primera ${terminology.location.singular.toLowerCase()} para comenzar.`}
        onRowClick={(row) => navigate(`/stores/${row.id}`)}
        aria-label={`Listado de ${terminology.location.plural.toLowerCase()}`}
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
