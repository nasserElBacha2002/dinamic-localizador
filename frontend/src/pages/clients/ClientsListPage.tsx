import { Button, Group, Select, TextInput } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  DataTable,
  FilterBar,
  FormErrorAlert,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  ResponsiveModal,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useClientsList, useCreateClient } from "../../hooks/useClients";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { Client } from "../../types/client";
import { getApiErrorMessage } from "../../utils/errors";
import { navigateWithListContext } from "../../utils/list-navigation";

const CLIENTS_LIST_PATH = "/clients";

const TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
};

const TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
} as const;

export function ClientsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const table = useTableUrlState({ defaults: TABLE_DEFAULTS, fields: TABLE_FIELDS });
  const create = useCreateClient();
  const [name, setName] = useState("");
  const [opened, setOpened] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const filters = {
    page: table.page,
    limit: table.pageSize,
    search: table.state.search || undefined,
    active: table.state.active === "all" ? undefined : table.state.active === "true",
  };
  const { data, isPending, isError, error, isCompanyLoading } = useClientsList(filters);

  const columns = useMemo<DataTableColumn<Client>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
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
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<Client>>(
    () => ({
      title: (row) => row.name,
      status: (row) => (
        <StatusBadge
          label={row.isActive ? "Activo" : "Inactivo"}
          tone={row.isActive ? "success" : "neutral"}
        />
      ),
      fields: [],
    }),
    [],
  );

  const close = () => {
    setOpened(false);
    setName("");
    setCreateError(null);
  };

  const submit = async () => {
    try {
      setCreateError(null);
      await create.mutateAsync({ name: name.trim() });
      close();
    } catch (submitError) {
      setCreateError(getApiErrorMessage(submitError));
    }
  };

  const handleActiveFilterChange = useCallback(
    (value: string | null) => {
      if (value) {
        table.setField("active", value as "all" | "true" | "false");
      }
    },
    [table],
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Administrá clientes y sus formatos."
        action={<Button onClick={() => setOpened(true)}>Nuevo cliente</Button>}
      />

      <FilterBar
        search={
          <SearchInput
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
            placeholder="Buscar por nombre"
            label="Buscar"
          />
        }
        activeFilterCount={table.activeFilterCount}
        onClearFilters={table.resetFilters}
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
      </FilterBar>

      <DataTable
        rows={data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.id}
        loading={isCompanyLoading || isPending}
        error={isError ? getApiErrorMessage(error) : undefined}
        emptyTitle="No hay clientes"
        emptyDescription="Creá el primer cliente para comenzar."
        onRowClick={(row) =>
          navigateWithListContext(navigate, `/clients/${row.id}`, CLIENTS_LIST_PATH, location)
        }
        aria-label="Listado de clientes"
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

      <ResponsiveModal
        opened={opened}
        onClose={close}
        title="Nuevo cliente"
        footer={
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button loading={create.isPending} disabled={!name.trim()} onClick={() => void submit()}>
              Crear
            </Button>
          </Group>
        }
      >
        <TextInput
          label="Nombre"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <FormErrorAlert message={createError} />
      </ResponsiveModal>
    </>
  );
}
