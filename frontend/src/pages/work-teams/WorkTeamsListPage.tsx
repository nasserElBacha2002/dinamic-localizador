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
import { useWorkTeams } from "../../hooks/useWorkTeams";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListNavigationState } from "../../hooks/useListNavigationState";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { WorkTeam } from "../../types/work-team";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { hasPermission } from "../../utils/permissions";
import { navigateWithListContext } from "../../utils/list-navigation";

const mapWorkTeamsListError = (message: string): string => {
  if (
    message.includes("usá rutas con /api/companies") ||
    message.includes("empresa activa")
  ) {
    return "Seleccioná una empresa para continuar.";
  }
  return message;
};

const WORK_TEAMS_LIST_PATH = "/work-teams";

const TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
};

const TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
} as const;

export function WorkTeamsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const listNav = useListNavigationState(WORK_TEAMS_LIST_PATH);
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "employees:manage");

  const table = useTableUrlState({
    defaults: TABLE_DEFAULTS,
    fields: TABLE_FIELDS,
  });

  const filters = {
    page: table.page,
    limit: table.pageSize,
    search: table.state.search || undefined,
    active: table.state.active === "all" ? undefined : table.state.active === "true",
  };

  const { data, isPending, isError, error, isCompanyLoading } = useWorkTeams(filters);

  const columns = useMemo<DataTableColumn<WorkTeam>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      {
        key: "description",
        header: "Descripción",
        getValue: (row) => row.description?.trim() || "—",
      },
      {
        key: "memberCount",
        header: "Integrantes",
        getValue: (row) => String(row.memberCount ?? 0),
      },
      {
        key: "activeMemberCount",
        header: "Activos",
        getValue: (row) => String(row.activeMemberCount ?? 0),
      },
      {
        key: "isActive",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={row.isActive ? "Activo" : "Inactivo"}
            tone={row.isActive ? "success" : "neutral"}
          />
        ),
      },
      {
        key: "updatedAt",
        header: "Última actualización",
        getValue: (row) => formatDateTime(row.updatedAt),
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
        title="Grupos de trabajo"
        description="Plantillas reutilizables de colaboradores para asignar rápidamente a operaciones."
        action={
          canManage ? (
            <Button component={Link} to="/work-teams/new" state={listNav}>
              Nuevo grupo
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
            placeholder="Buscar por nombre"
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
        loading={isCompanyLoading || isPending}
        error={isError ? mapWorkTeamsListError(getApiErrorMessage(error)) : undefined}
        emptyTitle="No hay grupos de trabajo"
        emptyDescription="Creá el primer grupo para comenzar."
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/work-teams/${row.id}`, WORK_TEAMS_LIST_PATH, location)
        }
        aria-label="Listado de grupos de trabajo"
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
