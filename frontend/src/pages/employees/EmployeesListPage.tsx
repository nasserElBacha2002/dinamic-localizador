import { Button, Select, Stack, Text, Alert } from "@mantine/core";
import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ActionMenu,
  DataTable,
  FilterBar,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useEmployeeCategories } from "../../hooks/useEmployeeCategories";
import { useEmployees } from "../../hooks/useEmployees";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import { terminology } from "../../domain/terminology";
import type { Employee } from "../../types/employee";
import type { EmployeeListSortField } from "../../types/employee-list";
import { EMPLOYEE_CATEGORY_FILTER_ALL, EMPLOYEE_CATEGORY_FILTER_NONE } from "../../types/employee-list";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";
import { navigateWithListContext } from "../../utils/list-navigation";
import { hasPermission } from "../../utils/permissions";
import {
  buildEmployeesListApiFilters,
  EMPLOYEE_TABLE_DEFAULTS,
  EMPLOYEE_TABLE_FIELDS,
  EMPLOYEE_TABLE_SORTABLE_COLUMN_KEYS,
} from "./employees-list-table-state";

const EMPLOYEES_LIST_PATH = "/employees";

export function EmployeesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const listNav = useListNavigationState(EMPLOYEES_LIST_PATH);
  const permissionsQuery = useCompanyPermissions();
  const canManageEmployees = hasPermission(
    permissionsQuery.data?.permissions,
    "employees:manage",
  );

  const table = useTableUrlState({
    defaults: EMPLOYEE_TABLE_DEFAULTS,
    fields: EMPLOYEE_TABLE_FIELDS,
  });

  const categoriesQuery = useEmployeeCategories({ includeInactive: false });
  const filters = buildEmployeesListApiFilters(table.state);
  const { data, isPending, isError, error } = useEmployees(filters);
  const catalogFailed = categoriesQuery.isError;

  const categoryFilterOptions = useMemo(() => {
    if (catalogFailed) {
      return [
        { value: EMPLOYEE_CATEGORY_FILTER_ALL, label: "Todas las categorías" },
        { value: EMPLOYEE_CATEGORY_FILTER_NONE, label: "Sin categoría" },
      ];
    }

    const categories = categoriesQuery.data ?? [];
    return [
      { value: EMPLOYEE_CATEGORY_FILTER_ALL, label: "Todas las categorías" },
      { value: EMPLOYEE_CATEGORY_FILTER_NONE, label: "Sin categoría" },
      ...categories.map((category) => ({
        value: category.id,
        label: category.isSystem ? `${category.name} (base)` : category.name,
      })),
    ];
  }, [catalogFailed, categoriesQuery.data]);

  const activeSecondaryFilterCount = useMemo(() => {
    let count = 0;
    if (table.state.active !== EMPLOYEE_TABLE_DEFAULTS.active) {
      count += 1;
    }
    if (table.state.categoryId !== EMPLOYEE_TABLE_DEFAULTS.categoryId) {
      count += 1;
    }
    return count;
  }, [table.state.active, table.state.categoryId]);

  const columns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      { key: "name", header: "Nombre", sortable: true, getValue: (row) => row.name },
      {
        key: "documentNumber",
        header: "Documento",
        sortable: true,
        getValue: (row) => row.documentNumber ?? "—",
      },
      {
        key: "phoneNumber",
        header: "Teléfono",
        sortable: true,
        getValue: (row) => row.phoneNumber,
      },
      {
        key: "category",
        header: "Categoría",
        sortable: true,
        getValue: (row) => row.category?.name ?? "—",
      },
      {
        key: "employeeType",
        header: "Tipo",
        sortable: true,
        getValue: (row) => employeeTypeLabels[row.employeeType],
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

  const mobileCard = useMemo<DataTableMobileCardConfig<Employee>>(
    () => ({
      title: (row) => row.name,
      status: (row) => (
        <StatusBadge
          label={activeStatusLabel(row.active)}
          tone={row.active ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "phoneNumber",
          label: "Teléfono",
          render: (row) => row.phoneNumber,
          priority: "primary",
        },
        {
          key: "category",
          label: "Categoría",
          render: (row) => row.category?.name ?? "—",
          priority: "primary",
        },
        {
          key: "employeeType",
          label: "Tipo",
          render: (row) => employeeTypeLabels[row.employeeType],
          priority: "primary",
        },
        {
          key: "documentNumber",
          label: "Documento",
          render: (row) => row.documentNumber ?? "—",
          priority: "secondary",
        },
      ],
    }),
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

  const handleCategoryFilterChange = useCallback(
    (value: string | null) => {
      table.setField("categoryId", value ?? EMPLOYEE_CATEGORY_FILTER_ALL);
    },
    [table],
  );

  const handleClearSecondaryFilters = useCallback(() => {
    table.setField("active", EMPLOYEE_TABLE_DEFAULTS.active);
    table.setField("categoryId", EMPLOYEE_TABLE_DEFAULTS.categoryId);
  }, [table]);

  const handleSortChange = useCallback(
    (field: string) => {
      if (!(EMPLOYEE_TABLE_SORTABLE_COLUMN_KEYS as readonly string[]).includes(field)) {
        return;
      }
      table.toggleSorting(field as EmployeeListSortField, "asc");
    },
    [table],
  );

  return (
    <>
      <PageHeader
        title={terminology.worker.plural}
        description={`Administrá el personal habilitado para ${terminology.operation.plural.toLowerCase()}.`}
        action={
          canManageEmployees ? (
            <ActionMenu
              primary={
                <Button component={Link} to="/employees/new" state={listNav}>
                  {`Nuevo ${terminology.worker.singular.toLowerCase()}`}
                </Button>
              }
              items={[
                {
                  key: "import",
                  label: `Importar ${terminology.worker.plural.toLowerCase()}`,
                  onClick: () =>
                    navigateWithListContext(
                      navigate,
                      "/imports?entity=employees",
                      EMPLOYEES_LIST_PATH,
                      location,
                    ),
                },
              ]}
              menuLabel="Más acciones de colaboradores"
            />
          ) : undefined
        }
      />

      {catalogFailed ? (
        <Alert color="red" title="No se pudieron cargar las categorías" mb="md">
          <Stack gap="xs">
            <Text size="sm">{getApiErrorMessage(categoriesQuery.error)}</Text>
            <Button size="xs" variant="light" onClick={() => void categoriesQuery.refetch()}>
              Reintentar
            </Button>
          </Stack>
        </Alert>
      ) : null}

      <FilterBar
        search={
          <SearchInput
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
            placeholder="Nombre, documento o teléfono"
            label="Buscar"
          />
        }
        activeFilterCount={activeSecondaryFilterCount}
        onClearFilters={handleClearSecondaryFilters}
      >
        <FilterBar.Item>
          <Select
            label="Estado"
            value={table.state.active}
            onChange={handleActiveFilterChange}
            data={[
              { value: "all", label: "Todos" },
              { value: "true", label: "Activos" },
              { value: "false", label: "Inactivos" },
            ]}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <Select
            label="Categoría"
            value={table.state.categoryId}
            onChange={handleCategoryFilterChange}
            data={categoryFilterOptions}
            searchable
            disabled={catalogFailed}
            nothingFoundMessage={catalogFailed ? "Catálogo no disponible" : "Sin categorías"}
            error={catalogFailed ? "Error al cargar categorías" : undefined}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        rows={data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.id}
        loading={isPending}
        error={isError ? getApiErrorMessage(error) : undefined}
        emptyTitle={`No hay ${terminology.worker.plural.toLowerCase()}`}
        emptyDescription={`Creá el primer ${terminology.worker.singular.toLowerCase()} para comenzar.`}
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/employees/${row.id}`, EMPLOYEES_LIST_PATH, location)
        }
        aria-label={`Listado de ${terminology.worker.plural.toLowerCase()}`}
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
