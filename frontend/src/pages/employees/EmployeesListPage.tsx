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

const EMPLOYEES_LIST_PATH = "/employees";

const EMPLOYEE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
};

const EMPLOYEE_TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
} as const;

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

  const filters = {
    page: table.page,
    limit: table.pageSize,
    search: table.state.search || undefined,
    active: table.state.active === "all" ? undefined : table.state.active === "true",
  };

  const { data, isPending, isError, error } = useEmployees(filters);

  const columns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      {
        key: "documentNumber",
        header: "Documento",
        getValue: (row) => row.documentNumber ?? "—",
      },
      { key: "phoneNumber", header: "Teléfono", getValue: (row) => row.phoneNumber },
      {
        key: "employeeType",
        header: "Tipo",
        getValue: (row) => employeeTypeLabels[row.employeeType],
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
