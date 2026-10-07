import { Button, Group, Select, Stack, Tabs, TextInput } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { EntityLink } from "../../components/entity-link";
import {
  ActionMenu,
  ConfirmDialog,
  DataTable,
  DetailFieldGrid,
  EntityIdentity,
  EntityPageTitle,
  ErrorState,
  FilterBar,
  FormErrorAlert,
  LoadingState,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  ResponsiveModal,
  SearchInput,
  SectionCard,
  StatusBadge,
  type ActionMenuItem,
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
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { WorkTeamMemberMultiSelect } from "../../components/work-teams/WorkTeamMemberMultiSelect";
import type { Employee } from "../../types/employee";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { CompanyLocationType } from "../../types/company-location-type";
import type { Service } from "../../types/service";
import { terminology } from "../../domain/terminology";
import { useServices } from "../../hooks/useServices";
import { getApiErrorMessage } from "../../utils/errors";
import { activeStatusLabel } from "../../utils/labels";

const TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
};

const TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
} as const;

type ClientDetailTab = "formats" | "employees" | "services";

function resolveClientDetailTab(tabParam: string | null): ClientDetailTab {
  if (tabParam === "employees") {
    return "employees";
  }
  if (tabParam === "services") {
    return "services";
  }
  return "formats";
}

export function ClientDetailPage() {
  const navigate = useNavigate();
  const { goBackToList } = useListBackNavigation("/clients");
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveClientDetailTab(searchParams.get("tab"));
  const table = useTableUrlState({ defaults: TABLE_DEFAULTS, fields: TABLE_FIELDS });
  const client = useClient(id);
  const types = useClientLocationTypes(
    id,
    {
      page: table.page,
      limit: table.pageSize,
      search: table.state.search || undefined,
      active: table.state.active === "all" ? undefined : table.state.active === "true",
    },
    activeTab === "formats",
  );
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
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const employees = useClientEmployees(id, activeTab === "employees");
  const replaceEmployees = useReplaceClientEmployees(id ?? "");
  const removeEmployee = useRemoveClientEmployee(id ?? "");
  const [employeesOpened, setEmployeesOpened] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeActive, setEmployeeActive] = useState<"all" | "true" | "false">("all");
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [servicesPage, setServicesPage] = useState(1);
  const [servicesPageSize, setServicesPageSize] = useState(10);
  const clientServices = useServices(
    {
      clientId: id,
      page: servicesPage,
      limit: servicesPageSize,
    },
    activeTab === "services" && Boolean(id),
  );

  const columns = useMemo<DataTableColumn<CompanyLocationType>[]>(
    () => [
      {
        key: "name",
        header: "Nombre",
        getValue: (row) => row.name,
        render: (row) => (
          <EntityIdentity name={row.name} entityType="company" subtitle={row.code} />
        ),
      },
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

  const employeeRows = useMemo(
    () =>
      (employees.data ?? []).filter(
        (employee) =>
          (!employeeSearch ||
            employee.name.toLowerCase().includes(employeeSearch.toLowerCase())) &&
          (employeeActive === "all" || employee.active === (employeeActive === "true")),
      ),
    [employeeActive, employeeSearch, employees.data],
  );

  const employeeColumns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      {
        key: "name",
        header: "Nombre",
        render: (row) => (
          <EntityLink entityType="employee" entityId={row.id} label={row.name} stopPropagation />
        ),
      },
      {
        key: "active",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={row.active ? "Activo" : "Inactivo"}
            tone={row.active ? "success" : "neutral"}
          />
        ),
      },
      {
        key: "actions",
        header: "Acciones",
        render: (row) => (
          <Button
            size="compact-sm"
            color="red"
            variant="subtle"
            loading={removeEmployee.isPending}
            disabled={removeEmployee.isPending}
            onClick={(event) => {
              event.stopPropagation();
              void removeEmployee.mutateAsync(row.id);
            }}
          >
            Quitar
          </Button>
        ),
      },
    ],
    [removeEmployee],
  );

  const serviceColumns = useMemo<DataTableColumn<Service>[]>(
    () => [
      {
        key: "name",
        header: "Nombre",
        render: (row) => <EntityIdentity name={row.name} entityType="service" />,
      },
      { key: "serviceFormat", header: "Formato", getValue: (row) => row.serviceFormat ?? "—" },
      { key: "locality", header: "Localidad", getValue: (row) => row.locality ?? "—" },
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

  const serviceMobileCard = useMemo<DataTableMobileCardConfig<Service>>(
    () => ({
      title: (row) => row.name,
      subtitle: (row) => row.locality ?? undefined,
      status: (row) => (
        <StatusBadge
          label={activeStatusLabel(row.active)}
          tone={row.active ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "serviceFormat",
          label: "Formato",
          render: (row) => row.serviceFormat ?? "—",
          visibility: "always",
        },
      ],
    }),
    [],
  );

  const employeeMobileCard = useMemo<DataTableMobileCardConfig<Employee>>(
    () => ({
      title: (row) => row.name,
      status: (row) => (
        <StatusBadge
          label={row.active ? "Activo" : "Inactivo"}
          tone={row.active ? "success" : "neutral"}
        />
      ),
      fields: [],
    }),
    [],
  );

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

  const clientData = client.data;

  const headerMenuItems: ActionMenuItem[] = [
    {
      key: "edit",
      label: "Editar nombre",
      onClick: () => {
        setClientName(clientData.name);
        setEditClient(true);
      },
    },
    clientData.isActive
      ? {
          key: "deactivate",
          label: "Desactivar cliente",
          destructive: true,
          onClick: () => setDeactivateOpen(true),
        }
      : {
          key: "activate",
          label: "Activar cliente",
          loading: activate.isPending,
          disabled: activate.isPending,
          onClick: () => void activate.mutateAsync(clientData.id),
        },
    {
      key: "back",
      label: "Volver al listado",
      onClick: goBackToList,
    },
  ];

  return (
    <Stack gap="md">
      <PageHeader
        title={<EntityPageTitle name={clientData.name} entityType="company" />}
        description="Cliente operativo · formatos, ubicaciones y colaboradores asociados."
        action={
          <ActionMenu
            primary={
              <Button
                variant="default"
                onClick={() => {
                  setClientName(clientData.name);
                  setEditClient(true);
                }}
              >
                Editar
              </Button>
            }
            items={headerMenuItems}
            menuLabel="Más acciones del cliente"
          />
        }
      />

      <SectionCard title="Resumen">
        <DetailFieldGrid
          fields={[
            { label: "Nombre", value: clientData.name },
            {
              label: "Estado",
              value: (
                <StatusBadge
                  label={clientData.isActive ? "Activo" : "Inactivo"}
                  tone={clientData.isActive ? "success" : "neutral"}
                />
              ),
            },
          ]}
        />
      </SectionCard>

      <Tabs
        value={activeTab}
        onChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value === "formats") {
            next.delete("tab");
          } else if (value === "employees" || value === "services") {
            next.set("tab", value);
          }
          setSearchParams(next);
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="formats">Formatos</Tabs.Tab>
          <Tabs.Tab value="services">{terminology.service.plural}</Tabs.Tab>
          <Tabs.Tab value="employees">Colaboradores</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {activeTab === "formats" ? (
        <SectionCard
          title="Formatos"
          description="Tipos de ubicación propios de este cliente."
          action={
            <Button disabled={!clientData.isActive} onClick={() => setCreateOpened(true)}>
              Nuevo formato
            </Button>
          }
        >
          <Stack gap="md">
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
          </Stack>
        </SectionCard>
      ) : null}

      {activeTab === "services" ? (
        <SectionCard
          title={terminology.service.plural}
          description={`${terminology.service.plural} vinculados a este cliente.`}
        >
          <DataTable
            rows={clientServices.data?.data ?? []}
            columns={serviceColumns}
            getRowKey={(row) => row.id}
            loading={clientServices.isPending}
            error={
              clientServices.isError ? getApiErrorMessage(clientServices.error) : undefined
            }
            emptyTitle={`No hay ${terminology.service.plural.toLowerCase()} asociados`}
            emptyDescription={`Las ${terminology.service.plural.toLowerCase()} vinculadas a este cliente aparecerán acá.`}
            onRowClick={(row) => navigate(`/services/${row.id}`)}
            aria-label={`${terminology.service.plural} del cliente`}
            mobileView="cards"
            mobileCard={serviceMobileCard}
            pagination={
              clientServices.data && clientServices.data.data.length > 0 ? (
                <PaginationControls
                  meta={mapApiPaginationMeta(clientServices.data.meta)}
                  onPageChange={setServicesPage}
                  pageSize={servicesPageSize}
                  onPageSizeChange={(size) => {
                    setServicesPageSize(size);
                    setServicesPage(1);
                  }}
                  showPageSizeSelector
                />
              ) : undefined
            }
          />
        </SectionCard>
      ) : null}

      {activeTab === "employees" ? (
        <SectionCard
          title="Colaboradores"
          description="Personas con acceso operativo asociadas a este cliente."
          action={
            <Button
              disabled={!clientData.isActive}
              onClick={() => {
                setSelectedEmployeeIds((employees.data ?? []).map((employee) => employee.id));
                setEmployeeError(null);
                setEmployeesOpened(true);
              }}
            >
              Asignar colaboradores
            </Button>
          }
        >
          <Stack gap="md">
            <FilterBar
              search={
                <SearchInput
                  value={employeeSearch}
                  onChange={setEmployeeSearch}
                  onSearch={setEmployeeSearch}
                  placeholder="Buscar por nombre"
                  label="Buscar"
                />
              }
              activeFilterCount={(employeeSearch ? 1 : 0) + (employeeActive === "all" ? 0 : 1)}
              onClearFilters={() => {
                setEmployeeSearch("");
                setEmployeeActive("all");
              }}
            >
              <FilterBar.Item>
                <Select
                  label="Estado"
                  value={employeeActive}
                  onChange={(value) =>
                    value && setEmployeeActive(value as "all" | "true" | "false")
                  }
                  data={[
                    { value: "all", label: "Todos" },
                    { value: "true", label: "Activos" },
                    { value: "false", label: "Inactivos" },
                  ]}
                />
              </FilterBar.Item>
            </FilterBar>
            <DataTable
              rows={employeeRows}
              columns={employeeColumns}
              getRowKey={(row) => row.id}
              loading={employees.isPending}
              error={employees.isError ? getApiErrorMessage(employees.error) : undefined}
              emptyTitle="No hay colaboradores asociados"
              emptyDescription="Asigná colaboradores a este cliente."
              aria-label="Listado de colaboradores del cliente"
              mobileView="cards"
              mobileCard={employeeMobileCard}
            />
          </Stack>
        </SectionCard>
      ) : null}

      {activeTab === "formats" ? (
        <ResponsiveModal
          opened={createOpened}
          onClose={closeCreate}
          title="Nuevo formato"
          footer={
            <Group justify="flex-end">
              <Button variant="default" disabled={create.isPending} onClick={closeCreate}>
                Cancelar
              </Button>
              <Button
                loading={create.isPending}
                disabled={!formatName.trim()}
                onClick={() => void submitCreate()}
              >
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
        </ResponsiveModal>
      ) : null}

      {activeTab === "employees" ? (
        <ResponsiveModal
          opened={employeesOpened}
          onClose={() => setEmployeesOpened(false)}
          title="Asignar colaboradores"
          footer={
            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={replaceEmployees.isPending}
                onClick={() => setEmployeesOpened(false)}
              >
                Cancelar
              </Button>
              <Button
                loading={replaceEmployees.isPending}
                onClick={() =>
                  void (async () => {
                    try {
                      setEmployeeError(null);
                      await replaceEmployees.mutateAsync(selectedEmployeeIds);
                      setEmployeesOpened(false);
                    } catch (error) {
                      setEmployeeError(getApiErrorMessage(error));
                    }
                  })()
                }
              >
                Guardar
              </Button>
            </Group>
          }
        >
          <WorkTeamMemberMultiSelect
            selectedEmployeeIds={selectedEmployeeIds}
            onChange={setSelectedEmployeeIds}
            existingMembers={employees.data ?? []}
            allowCreate={false}
          />
          <FormErrorAlert message={employeeError} />
        </ResponsiveModal>
      ) : null}

      <ResponsiveModal
        opened={editClient}
        onClose={() => setEditClient(false)}
        title="Editar cliente"
        footer={
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditClient(false)}>
              Cancelar
            </Button>
            <Button
              loading={updateClient.isPending}
              disabled={!clientName.trim()}
              onClick={() =>
                void updateClient
                  .mutateAsync({ id, name: clientName.trim() })
                  .then(() => setEditClient(false))
              }
            >
              Guardar
            </Button>
          </Group>
        }
      >
        <TextInput
          label="Nombre"
          value={clientName}
          onChange={(event) => setClientName(event.currentTarget.value)}
        />
      </ResponsiveModal>

      {activeTab === "formats" ? (
        <ResponsiveModal
          opened={Boolean(editType)}
          onClose={() => setEditType(null)}
          title="Editar formato"
          footer={
            editType ? (
              <Group justify="space-between" w="100%">
                <Button
                  color={editType.isActive ? "red" : undefined}
                  variant="default"
                  loading={disable.isPending || update.isPending}
                  disabled={disable.isPending || update.isPending}
                  onClick={() =>
                    void (editType.isActive
                      ? disable.mutateAsync(editType.id)
                      : update.mutateAsync({ id: editType.id, input: { isActive: true } })
                    ).then((changed) => setEditType(changed))
                  }
                >
                  {editType.isActive ? "Desactivar" : "Activar"}
                </Button>
                <Group>
                  <Button variant="default" onClick={() => setEditType(null)}>
                    Cancelar
                  </Button>
                  <Button
                    loading={update.isPending}
                    disabled={
                      !editType.name.trim() || !editType.code.trim() || disable.isPending
                    }
                    onClick={() => void submitEditType()}
                  >
                    Guardar
                  </Button>
                </Group>
              </Group>
            ) : undefined
          }
        >
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
              <FormErrorAlert message={editError} />
            </>
          ) : null}
        </ResponsiveModal>
      ) : null}

      <ConfirmDialog
        open={deactivateOpen}
        title="Desactivar cliente"
        description="El cliente dejará de estar disponible para nuevas asignaciones. Los datos existentes no se eliminan."
        confirmLabel="Desactivar"
        destructive
        loading={deactivate.isPending}
        onConfirm={() =>
          void deactivate.mutateAsync(clientData.id).then(() => setDeactivateOpen(false))
        }
        onCancel={() => setDeactivateOpen(false)}
      />
    </Stack>
  );
}
