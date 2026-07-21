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
import { useEmployeeCategories } from "../../hooks/useEmployeeCategories";
import { useEmployees } from "../../hooks/useEmployees";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import { terminology } from "../../domain/terminology";
import type { Employee } from "../../types/employee";
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

  const categoryFilterOptions = useMemo(() => {
    const categories = categoriesQuery.data ?? [];
    return [
      { value: "all", label: "Todas las categorías" },
      { value: "none", label: "Sin categoría" },
      ...categories.map((category) => ({
        value: category.id,
        label: category.isSystem ? `${category.name} (base)` : category.name,
      })),
    ];
  }, [categoriesQuery.data]);

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
      table.setField("categoryId", value ?? "all");
    },
    [table],
  );

  const handleSortChange = useCallback(
    (field: string) => {
      if (!(EMPLOYEE_TABLE_SORTABLE_COLUMN_KEYS as readonly string[]).includes(field)) {
        return;
      }
      table.toggleSorting(field, "asc");
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
            <Button component={Link} to="/employees/new" state={listNav}>
              {`Nuevo ${terminology.worker.singular.toLowerCase()}`}
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
            placeholder="Nombre, documento o teléfono"
            label="Buscar"
          />
        </FilterBar.Item>
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
            nothingFoundMessage="Sin categorías"
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
