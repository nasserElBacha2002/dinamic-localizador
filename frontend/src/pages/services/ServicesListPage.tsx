import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@mantine/core";
import {
  ActionMenu,
  CascadingFilterSelect,
  DataTable,
  FilterBar,
  FilterSelect,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useServiceFacets, useServices } from "../../hooks/useServices";
import { useCompanyLocationTypes } from "../../hooks/useCompanyLocationTypes";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { terminology } from "../../domain/terminology";
import type { Service } from "../../types/service";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";
import { navigateWithListContext } from "../../utils/list-navigation";
import { hasPermission } from "../../utils/permissions";
import { ServicesListFiltersErrorBanner } from "./ServicesListFiltersErrorBanner";
import {
  buildServicesListApiFilters,
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
  SERVICE_TABLE_SORTABLE_COLUMN_KEYS,
  shouldOmitServiceTableValue,
} from "./services-list-table-state";

const SERVICES_LIST_PATH = "/services";

export function ServicesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const listNav = useListNavigationState(SERVICES_LIST_PATH);
  const permissionsQuery = useCompanyPermissions();
  const canManageServices = hasPermission(permissionsQuery.data?.permissions, "services:manage");

  const table = useTableUrlState({
    defaults: SERVICE_TABLE_DEFAULTS,
    fields: SERVICE_TABLE_FIELDS,
    shouldOmitFromUrl: (key, value, defaults) =>
      shouldOmitServiceTableValue(key, value, defaults),
  });

  const locationTypesQuery = useCompanyLocationTypes(false);
  const facetsQuery = useServiceFacets();

  const listFilters = buildServicesListApiFilters(table.state);
  const { data, isPending, isError, error } = useServices(listFilters);

  const formatOptions = useMemo(() => {
    const locationTypes = locationTypesQuery.data ?? [];
    return [
      { value: "", label: "Todos" },
      ...locationTypes
        .filter((type) => type.isActive)
        .map((type) => ({ value: type.code, label: type.name })),
      ...(table.state.serviceFormat &&
      !locationTypes.some((type) => type.isActive && type.code === table.state.serviceFormat)
        ? [{ value: table.state.serviceFormat, label: table.state.serviceFormat }]
        : []),
    ];
  }, [locationTypesQuery.data, table.state.serviceFormat]);

  const localityOptions = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...(facetsQuery.data?.localities ?? []).map((locality) => ({
        value: locality,
        label: locality,
      })),
    ],
    [facetsQuery.data?.localities],
  );

  const neighborhoodOptions = useMemo(() => {
    const neighborhoods =
      table.state.locality && facetsQuery.data
        ? (facetsQuery.data.neighborhoodsByLocality[table.state.locality] ?? [])
        : [];
    return [
      { value: "", label: "Todos" },
      ...neighborhoods.map((neighborhood) => ({
        value: neighborhood,
        label: neighborhood,
      })),
    ];
  }, [facetsQuery.data, table.state.locality]);

  const activeSecondaryFilterCount = useMemo(() => {
    let count = 0;
    if (table.state.serviceFormat !== SERVICE_TABLE_DEFAULTS.serviceFormat) {
      count += 1;
    }
    if (table.state.locality !== SERVICE_TABLE_DEFAULTS.locality) {
      count += 1;
    }
    if (table.state.neighborhood !== SERVICE_TABLE_DEFAULTS.neighborhood) {
      count += 1;
    }
    if (table.state.active !== SERVICE_TABLE_DEFAULTS.active) {
      count += 1;
    }
    return count;
  }, [
    table.state.active,
    table.state.locality,
    table.state.neighborhood,
    table.state.serviceFormat,
  ]);

  const columns = useMemo<DataTableColumn<Service>[]>(
    () => [
      { key: "name", header: "Nombre", sortable: true, getValue: (row) => row.name },
      {
        key: "neighborhood",
        header: "Barrio",
        sortable: true,
        getValue: (row) => row.neighborhood ?? "—",
      },
      {
        key: "locality",
        header: "Localidad",
        sortable: true,
        getValue: (row) => row.locality ?? "—",
      },
      {
        key: "serviceFormat",
        header: "Formato",
        sortable: true,
        getValue: (row) => row.serviceFormat ?? "—",
      },
      {
        key: "address",
        header: "Dirección",
        sortable: true,
        getValue: (row) => row.address ?? "—",
      },
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
        sortable: true,
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

  const mobileCard = useMemo<DataTableMobileCardConfig<Service>>(
    () => ({
      title: (row) => row.name,
      subtitle: (row) => row.address ?? undefined,
      status: (row) => (
        <StatusBadge
          label={activeStatusLabel(row.active)}
          tone={row.active ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "locality",
          label: "Localidad",
          render: (row) => row.locality ?? "—",
          visibility: "always",
        },
        {
          key: "neighborhood",
          label: "Barrio",
          render: (row) => row.neighborhood ?? "—",
          visibility: "always",
        },
        {
          key: "serviceFormat",
          label: "Formato",
          render: (row) => row.serviceFormat ?? "—",
          visibility: "always",
        },
        {
          key: "allowedRadiusMeters",
          label: "Radio",
          render: (row) => `${row.allowedRadiusMeters} m`,
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  const handleSortChange = useCallback(
    (field: string) => {
      if (!(SERVICE_TABLE_SORTABLE_COLUMN_KEYS as readonly string[]).includes(field)) {
        return;
      }
      table.toggleSorting(field, "asc");
    },
    [table],
  );

  const handleClearSecondaryFilters = useCallback(() => {
    table.setState({
      serviceFormat: SERVICE_TABLE_DEFAULTS.serviceFormat,
      locality: SERVICE_TABLE_DEFAULTS.locality,
      neighborhood: SERVICE_TABLE_DEFAULTS.neighborhood,
      active: SERVICE_TABLE_DEFAULTS.active,
    });
  }, [table]);

  const facetsLoading = facetsQuery.isPending || facetsQuery.isFetching;
  const formatsLoading = locationTypesQuery.isPending || locationTypesQuery.isFetching;
  const facetsFailed = facetsQuery.isError;
  const formatsFailed = locationTypesQuery.isError;

  return (
    <>
      <PageHeader
        title={terminology.service.plural}
        description="Configurá ubicaciones y radios permitidos."
        action={
          canManageServices ? (
            <ActionMenu
              primary={
                <Button component={Link} to="/services/new" state={listNav}>
                  {`Nueva ${terminology.service.singular.toLowerCase()}`}
                </Button>
              }
              menuLabel="Más acciones de servicios"
              items={[
                {
                  key: "import",
                  label: `Importar ${terminology.service.plural.toLowerCase()}`,
                  onClick: () =>
                    navigateWithListContext(
                      navigate,
                      "/imports?entity=services",
                      SERVICES_LIST_PATH,
                      location,
                    ),
                },
              ]}
            />
          ) : undefined
        }
      />

      <ServicesListFiltersErrorBanner
        facetsFailed={facetsFailed}
        formatsFailed={formatsFailed}
        onRetryFacets={() => {
          void facetsQuery.refetch();
        }}
        onRetryFormats={() => {
          void locationTypesQuery.refetch();
        }}
      />

      <FilterBar
        search={
          <SearchInput
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
            placeholder="Nombre, dirección, barrio o localidad"
            label="Buscar"
          />
        }
        activeFilterCount={activeSecondaryFilterCount}
        onClearFilters={handleClearSecondaryFilters}
      >
        <FilterBar.Item>
          <FilterSelect
            label="Formato"
            value={table.state.serviceFormat}
            onChange={(value) => table.setField("serviceFormat", value)}
            data={formatOptions}
            clearable
            disabled={formatsLoading || formatsFailed}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <CascadingFilterSelect
            parentLabel="Localidad"
            parentValue={table.state.locality}
            onCascadeChange={({ parentValue, childValue }) =>
              table.setState({ locality: parentValue, neighborhood: childValue })
            }
            parentData={localityOptions}
            parentPlaceholder="Todas"
            childLabel="Barrio"
            childValue={table.state.neighborhood}
            onChildChange={(value) => table.setField("neighborhood", value)}
            childData={neighborhoodOptions}
            childPlaceholder="Todos"
            disabled={facetsLoading || facetsFailed}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Estado"
            value={table.state.active}
            onChange={(value) => {
              if (!value) {
                return;
              }
              table.setField("active", value as "all" | "true" | "false");
            }}
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
        sortBy={table.state.sortBy}
        sortDirection={table.state.sortOrder}
        onSortChange={handleSortChange}
        mobileView="cards"
        mobileCard={mobileCard}
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
