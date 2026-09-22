import { Button, Group, Select, Stack, Tabs, TextInput } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import {
  DataTable,
  ErrorState,
  FilterBar,
  FormErrorAlert,
  LoadingState,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  ResponsiveModal,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useActivateClient,
  useClient,
  useClientLocationTypes,
  useCreateClientLocationType,
  useDeactivateClient,
  useDisableClientLocationType,
  useUpdateClient,
  useUpdateClientLocationType,
  useClientEmployees,
  useReplaceClientEmployees,
  useRemoveClientEmployee,
} from "../../hooks/useClients";
import { WorkTeamMemberMultiSelect } from "../../components/work-teams/WorkTeamMemberMultiSelect";
import type { Employee } from "../../types/employee";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { CompanyLocationType } from "../../types/company-location-type";
import { getApiErrorMessage } from "../../utils/errors";

const TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
};

const TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
} as const;

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "employees" ? "employees" : "formats";
  const table = useTableUrlState({ defaults: TABLE_DEFAULTS, fields: TABLE_FIELDS });
  const client = useClient(id);
  const types = useClientLocationTypes(id, {
    page: table.page,
    limit: table.pageSize,
    search: table.state.search || undefined,
    active: table.state.active === "all" ? undefined : table.state.active === "true",
  }, activeTab === "formats");
  const create = useCreateClientLocationType(id ?? "");
  const update = useUpdateClientLocationType(id ?? "");
  const disable = useDisableClientLocationType(id ?? "");
  const updateClient = useUpdateClient();
  const activate = useActivateClient();
  const deactivate = useDeactivateClient();
  const [createOpened, setCreateOpened] = useState(false);
  const [formatName, setFormatName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [editClient, setEditClient] = useState(false);
  const [clientName, setClientName] = useState("");
  const [editType, setEditType] = useState<CompanyLocationType | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const employees = useClientEmployees(id, activeTab === "employees");
  const replaceEmployees = useReplaceClientEmployees(id ?? "");
  const removeEmployee = useRemoveClientEmployee(id ?? "");
  const [employeesOpened, setEmployeesOpened] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeActive, setEmployeeActive] = useState<"all" | "true" | "false">("all");
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  const columns = useMemo<DataTableColumn<CompanyLocationType>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      { key: "code", header: "Código", getValue: (row) => row.code },
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

  const mobileCard = useMemo<DataTableMobileCardConfig<CompanyLocationType>>(
    () => ({
      title: (row) => row.name,
      subtitle: (row) => row.code,
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

  const employeeRows = useMemo(() => (employees.data ?? []).filter((employee) =>
    (!employeeSearch || employee.name.toLowerCase().includes(employeeSearch.toLowerCase())) &&
    (employeeActive === "all" || employee.active === (employeeActive === "true")),
  ), [employeeActive, employeeSearch, employees.data]);
  const employeeColumns = useMemo<DataTableColumn<Employee>[]>(() => [
    { key: "name", header: "Nombre", getValue: (row) => row.name },
    { key: "active", header: "Estado", render: (row) => <StatusBadge label={row.active ? "Activo" : "Inactivo"} tone={row.active ? "success" : "neutral"} /> },
    { key: "actions", header: "Acciones", render: (row) => <Button size="compact-sm" color="red" variant="subtle" loading={removeEmployee.isPending} disabled={removeEmployee.isPending} onClick={(event) => { event.stopPropagation(); void removeEmployee.mutateAsync(row.id); }}>Quitar</Button> },
  ], [removeEmployee]);
  const employeeMobileCard = useMemo<DataTableMobileCardConfig<Employee>>(() => ({
    title: (row) => row.name,
    status: (row) => <StatusBadge label={row.active ? "Activo" : "Inactivo"} tone={row.active ? "success" : "neutral"} />,
    fields: [],
  }), []);

  const closeCreate = () => {
    setCreateOpened(false);
    setFormatName("");
    setCreateError(null);
  };

  const submitCreate = async () => {
    try {
      setCreateError(null);
      await create.mutateAsync({ name: formatName.trim() });
      closeCreate();
    } catch (error) {
      setCreateError(getApiErrorMessage(error));
    }
  };

  const submitEditType = async () => {
    if (!editType) return;
    try {
      setEditError(null);
      await update.mutateAsync({
        id: editType.id,
        input: { name: editType.name.trim(), code: editType.code.trim() },
      });
      setEditType(null);
    } catch (error) {
      setEditError(getApiErrorMessage(error));
    }
  };

  const handleActiveFilterChange = useCallback(
    (value: string | null) => {
      if (value) table.setField("active", value as "all" | "true" | "false");
    },
    [table],
  );

  if (!id) return <ErrorState message="Cliente no encontrado." />;
  if (client.isLoading) return <LoadingState />;
  if (!client.data) return <ErrorState message="Cliente no encontrado." />;

  return (
    <Stack>
      <PageHeader
        title={client.data.name}
        description="Formatos propios del cliente."
        action={
          <Group>
            <Button
              variant="default"
              onClick={() => {
                setClientName(client.data.name);
                setEditClient(true);
              }}
            >
              Editar
            </Button>
            <Button
              loading={activate.isPending || deactivate.isPending}
              disabled={activate.isPending || deactivate.isPending}
              onClick={() =>
                void (client.data.isActive
                  ? deactivate.mutateAsync(client.data.id)
                  : activate.mutateAsync(client.data.id))
              }
            >
              {client.data.isActive ? "Desactivar" : "Activar"}
            </Button>
            <StatusBadge
              label={client.data.isActive ? "Activo" : "Inactivo"}
              tone={client.data.isActive ? "success" : "neutral"}
            />
          </Group>
        }
      />

      <Tabs
        value={activeTab}
        onChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value === "employees") next.set("tab", "employees");
          else next.delete("tab");
          setSearchParams(next);
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="formats">Formatos</Tabs.Tab>
          <Tabs.Tab value="employees">Colaboradores</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {activeTab === "formats" ? <>
        <PageHeader
          title="Formatos"
          action={
            <Button disabled={!client.data.isActive} onClick={() => setCreateOpened(true)}>
              Nuevo formato
            </Button>
          }
        />

        <FilterBar
        search={
          <SearchInput
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
            placeholder="Buscar por nombre o código"
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
        rows={types.data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.id}
        loading={types.isPending}
        error={types.isError ? getApiErrorMessage(types.error) : undefined}
        emptyTitle="No hay formatos"
        emptyDescription="Creá el primer formato para este cliente."
        onRowClick={(row) => {
          setEditError(null);
          setEditType(row);
        }}
        aria-label="Listado de formatos del cliente"
        mobileView="cards"
        mobileCard={mobileCard}
        pagination={
          types.data && types.data.data.length > 0 ? (
            <PaginationControls
              meta={mapApiPaginationMeta(types.data.meta)}
              onPageChange={table.onPageChange}
              pageSize={table.pageSize}
              onPageSizeChange={table.onPageSizeChange}
              showPageSizeSelector
            />
          ) : undefined
        }
        />
      </> : <>
        <PageHeader title="Colaboradores" action={<Button disabled={!client.data.isActive} onClick={() => { setSelectedEmployeeIds((employees.data ?? []).map((employee) => employee.id)); setEmployeeError(null); setEmployeesOpened(true); }}>Asignar colaboradores</Button>} />
        <FilterBar search={<SearchInput value={employeeSearch} onChange={setEmployeeSearch} onSearch={setEmployeeSearch} placeholder="Buscar por nombre" label="Buscar" />} activeFilterCount={(employeeSearch ? 1 : 0) + (employeeActive === "all" ? 0 : 1)} onClearFilters={() => { setEmployeeSearch(""); setEmployeeActive("all"); }}>
          <FilterBar.Item><Select label="Estado" value={employeeActive} onChange={(value) => value && setEmployeeActive(value as "all" | "true" | "false")} data={[{ value: "all", label: "Todos" }, { value: "true", label: "Activos" }, { value: "false", label: "Inactivos" }]} /></FilterBar.Item>
        </FilterBar>
        <DataTable rows={employeeRows} columns={employeeColumns} getRowKey={(row) => row.id} loading={employees.isPending} error={employees.isError ? getApiErrorMessage(employees.error) : undefined} emptyTitle="No hay colaboradores asociados" emptyDescription="Asigná colaboradores a este cliente." aria-label="Listado de colaboradores del cliente" mobileView="cards" mobileCard={employeeMobileCard} />
      </>}

      {activeTab === "formats" ? <ResponsiveModal
        opened={createOpened}
        onClose={closeCreate}
        title="Nuevo formato"
        footer={
          <Group justify="flex-end">
            <Button variant="default" disabled={create.isPending} onClick={closeCreate}>
              Cancelar
            </Button>
            <Button loading={create.isPending} disabled={!formatName.trim()} onClick={() => void submitCreate()}>
              Crear
            </Button>
          </Group>
        }
      >
        <TextInput
          label="Nombre"
          value={formatName}
          onChange={(event) => setFormatName(event.currentTarget.value)}
        />
        <FormErrorAlert message={createError} />
      </ResponsiveModal> : null}

      {activeTab === "employees" ? <ResponsiveModal opened={employeesOpened} onClose={() => setEmployeesOpened(false)} title="Asignar colaboradores" footer={<Group justify="flex-end"><Button variant="default" disabled={replaceEmployees.isPending} onClick={() => setEmployeesOpened(false)}>Cancelar</Button><Button loading={replaceEmployees.isPending} onClick={() => void (async () => { try { setEmployeeError(null); await replaceEmployees.mutateAsync(selectedEmployeeIds); setEmployeesOpened(false); } catch (error) { setEmployeeError(getApiErrorMessage(error)); } })()}>Guardar</Button></Group>}>
        <WorkTeamMemberMultiSelect selectedEmployeeIds={selectedEmployeeIds} onChange={setSelectedEmployeeIds} existingMembers={employees.data ?? []} allowCreate={false} />
        <FormErrorAlert message={employeeError} />
      </ResponsiveModal> : null}

      <ResponsiveModal opened={editClient} onClose={() => setEditClient(false)} title="Editar cliente">
        <TextInput label="Nombre" value={clientName} onChange={(event) => setClientName(event.currentTarget.value)} />
        <Button
          mt="md"
          loading={updateClient.isPending}
          disabled={!clientName.trim()}
          onClick={() => void updateClient.mutateAsync({ id, name: clientName.trim() }).then(() => setEditClient(false))}
        >
          Guardar
        </Button>
      </ResponsiveModal>

      {activeTab === "formats" ? <ResponsiveModal opened={Boolean(editType)} onClose={() => setEditType(null)} title="Editar formato">
        {editType ? (
          <>
            <TextInput
              label="Nombre"
              value={editType.name}
              onChange={(event) => setEditType({ ...editType, name: event.currentTarget.value })}
            />
            <TextInput
              mt="sm"
              label="Código"
              value={editType.code}
              onChange={(event) => setEditType({ ...editType, code: event.currentTarget.value })}
            />
            <Group mt="md" justify="space-between">
              <Button
                color={editType.isActive ? "red" : undefined}
                variant="default"
                loading={disable.isPending || update.isPending}
                disabled={disable.isPending || update.isPending}
                onClick={() =>
                  void (editType.isActive
                    ? disable.mutateAsync(editType.id)
                    : update.mutateAsync({ id: editType.id, input: { isActive: true } }))
                      .then((changed) => setEditType(changed))
                }
              >
                {editType.isActive ? "Desactivar" : "Activar"}
              </Button>
              <Button
                loading={update.isPending}
                disabled={!editType.name.trim() || !editType.code.trim() || disable.isPending}
                onClick={() => void submitEditType()}
              >
                Guardar
              </Button>
            </Group>
            <FormErrorAlert message={editError} />
          </>
        ) : null}
      </ResponsiveModal> : null}
    </Stack>
  );
}
