import { Button, Select } from "@mantine/core";
import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { useTableUrlState } from "../../hooks/useTableUrlState";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useServices } from "../../hooks/useServices";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { terminology } from "../../domain/terminology";
import type { Service } from "../../types/service";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";
import { navigateWithListContext } from "../../utils/list-navigation";
import { hasPermission } from "../../utils/permissions";

const SERVICES_LIST_PATH = "/services";

const SERVICE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
};

const SERVICE_TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
} as const;

export function ServicesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const listNav = useListNavigationState(SERVICES_LIST_PATH);
  const permissionsQuery = useCompanyPermissions();
  const canManageServices = hasPermission(permissionsQuery.data?.permissions, "services:manage");

  const table = useTableUrlState({
    defaults: SERVICE_TABLE_DEFAULTS,
    fields: SERVICE_TABLE_FIELDS,
  });

  const { data, isPending, isError, error } = useServices({
    page: table.page,
    limit: table.pageSize,
    search: table.state.search || undefined,
    active: table.state.active === "all" ? undefined : table.state.active === "true",
  });

  const columns = useMemo<DataTableColumn<Service>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      { key: "neighborhood", header: "Barrio", getValue: (row) => row.neighborhood ?? "—" },
      { key: "locality", header: "Localidad", getValue: (row) => row.locality ?? "—" },
      { key: "serviceFormat", header: "Formato", getValue: (row) => row.serviceFormat ?? "—" },
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

      table.setField("active", value as "all" | "true" | "false");
    },
    [table],
  );

  return (
    <>
      <PageHeader
        title={terminology.service.plural}
        description="Configurá ubicaciones y radios permitidos."
        action={
          canManageServices ? (
            <Button component={Link} to="/services/new" state={listNav}>
              {`Nueva ${terminology.service.singular.toLowerCase()}`}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <FilterBar.Item>
          <SearchInput
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
            placeholder="Nombre, dirección, barrio o localidad"
            label="Buscar"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <Select
            label="Estado"
            value={table.state.active}
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
        emptyTitle={`No hay ${terminology.service.plural.toLowerCase()}`}
        emptyDescription={`Creá la primera ${terminology.service.singular.toLowerCase()} para comenzar.`}
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/services/${row.id}`, SERVICES_LIST_PATH, location)
        }
        aria-label={`Listado de ${terminology.service.plural.toLowerCase()}`}
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
