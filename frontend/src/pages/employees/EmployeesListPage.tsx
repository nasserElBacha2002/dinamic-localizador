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
import { useEmployees } from "../../hooks/useEmployees";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import { terminology } from "../../domain/terminology";
import type { Employee } from "../../types/employee";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel, employeeTypeLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function EmployeesListPage() {
  const navigate = useNavigate();
  const permissionsQuery = useCompanyPermissions();
  const canManageEmployees = hasPermission(
    permissionsQuery.data?.permissions,
    "employees:manage",
  );
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

  const filters = {
    page,
    limit: pageSize,
    search: search || undefined,
    active: activeFilter === "all" ? undefined : activeFilter === "true",
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

      resetPage();
      setActiveFilter(value as "all" | "true" | "false");
    },
    [resetPage],
  );

  return (
    <>
      <PageHeader
        title={terminology.worker.plural}
        description={`Administrá el personal habilitado para ${terminology.operation.plural.toLowerCase()}.`}
        action={
          canManageEmployees ? (
            <Button component={Link} to="/employees/new">
              {`Nuevo ${terminology.worker.singular.toLowerCase()}`}
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
            placeholder="Nombre, documento o teléfono"
            label="Buscar"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <Select
            label="Estado"
            value={activeFilter}
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
        onRowClick={(row) => navigate(`/employees/${row.id}`)}
        aria-label={`Listado de ${terminology.worker.plural.toLowerCase()}`}
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
