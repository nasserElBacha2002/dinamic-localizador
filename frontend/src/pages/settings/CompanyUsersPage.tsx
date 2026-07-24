import { Button, Select } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import {
  ActionMenu,
  ConfirmDialog,
  DataTable,
  ErrorState,
  FilterBar,
  LoadingState,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type ActionMenuItem,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useCompanyPermissions,
  useCompanyUsers,
  useCreateCompanyUser,
  useDeactivateCompanyUser,
  useUpdateCompanyUser,
} from "../../hooks/useCompanyUsers";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { CompanyUser, CreateCompanyUserInput } from "../../types/company-user";
import { formatDate } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";
import {
  COMPANY_USERS_TABLE_DEFAULTS,
  COMPANY_USERS_TABLE_FIELDS,
} from "./company-users-table-state";
import { CompanyUserDialog } from "./CompanyUserDialog";

export function CompanyUsersPage() {
  const table = useTableUrlState({
    defaults: COMPANY_USERS_TABLE_DEFAULTS,
    fields: COMPANY_USERS_TABLE_FIELDS,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CompanyUser | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const permissionsQuery = useCompanyPermissions();
  const canManageUsers = permissionsQuery.data?.permissions.includes("users:manage") ?? false;

  const filters = useMemo(
    () => ({
      page: table.page,
      limit: table.pageSize,
      search: table.state.search || undefined,
      role: table.state.role === "all" ? undefined : (table.state.role as CompanyUser["companyRole"]),
      status:
        table.state.status === "all"
          ? undefined
          : (table.state.status as CompanyUser["membershipStatus"]),
    }),
    [table.page, table.pageSize, table.state.role, table.state.search, table.state.status],
  );

  const usersQuery = useCompanyUsers(filters, canManageUsers);
  const createMutation = useCreateCompanyUser();
  const updateMutation = useUpdateCompanyUser();
  const deactivateMutation = useDeactivateCompanyUser();

  const activeSecondaryFilterCount = useMemo(() => {
    let count = 0;
    if (table.state.role !== COMPANY_USERS_TABLE_DEFAULTS.role) count += 1;
    if (table.state.status !== COMPANY_USERS_TABLE_DEFAULTS.status) count += 1;
    return count;
  }, [table.state.role, table.state.status]);

  const handleClearSecondaryFilters = useCallback(() => {
    table.setState({
      role: COMPANY_USERS_TABLE_DEFAULTS.role,
      status: COMPANY_USERS_TABLE_DEFAULTS.status,
    });
  }, [table]);

  const handleSearch = useCallback(
    (value: string) => {
      table.commitSearch(value);
    },
    [table],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      table.setSearch(value);
    },
    [table],
  );

  const openCreateDialog = () => {
    setDialogMode("create");
    setSelectedUser(null);
    setDialogError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (user: CompanyUser) => {
    setDialogMode("edit");
    setSelectedUser(user);
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleDialogSubmit = async (
    input:
      | CreateCompanyUserInput
      | { role: CompanyUser["companyRole"]; status: CompanyUser["membershipStatus"]; isDefault: boolean },
  ) => {
    setDialogError(null);

    try {
      if (dialogMode === "create") {
        const result = await createMutation.mutateAsync(input as CreateCompanyUserInput);
        setDialogOpen(false);
        notifications.show({
          color: "green",
          message:
            result.message ||
            "Usuario creado. Recordá compartir de forma segura la contraseña temporal que ingresaste.",
        });
        return;
      }

      if (!selectedUser) {
        return;
      }

      await updateMutation.mutateAsync({
        userId: selectedUser.userId,
        input,
      });
      setDialogOpen(false);
      notifications.show({ color: "green", message: "Usuario actualizado." });
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) {
      return;
    }

    try {
      await deactivateMutation.mutateAsync(deactivateTarget.userId);
      setDeactivateTarget(null);
      notifications.show({ color: "green", message: "Acceso desactivado." });
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
      setDeactivateTarget(null);
    }
  };

  const columns = useMemo<DataTableColumn<CompanyUser>[]>(
    () => [
      { key: "name", header: "Nombre", getValue: (row) => row.name },
      { key: "email", header: "Email", getValue: (row) => row.email },
      {
        key: "role",
        header: "Rol",
        getValue: (row) => companyRoleLabels[row.companyRole],
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={membershipStatusLabels[row.membershipStatus]}
            tone={row.membershipStatus === "ACTIVE" ? "success" : "neutral"}
          />
        ),
      },
      {
        key: "isDefault",
        header: "Predeterminada",
        getValue: (row) => (row.isDefault ? "Sí" : "No"),
      },
      {
        key: "updatedAt",
        header: "Actualizado",
        getValue: (row) => formatDate(row.updatedAt),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<CompanyUser>>(
    () => ({
      title: (row) => row.name,
      subtitle: (row) => row.email,
      status: (row) => (
        <StatusBadge
          label={membershipStatusLabels[row.membershipStatus]}
          tone={row.membershipStatus === "ACTIVE" ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "role",
          label: "Rol",
          getValue: (row) => companyRoleLabels[row.companyRole],
          visibility: "always",
        },
        {
          key: "isDefault",
          label: "Predeterminada",
          getValue: (row) => (row.isDefault ? "Sí" : "No"),
          visibility: "always",
        },
        {
          key: "updatedAt",
          label: "Actualizado",
          getValue: (row) => formatDate(row.updatedAt),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  if (permissionsQuery.isPending) {
    return <LoadingState message="Verificando permisos..." />;
  }

  if (!canManageUsers) {
    return <ErrorState message="No tenés permisos para gestionar usuarios de esta empresa." />;
  }

  return (
    <>
      <PageHeader
        title="Usuarios de empresa"
        description="Gestioná los usuarios que tienen acceso al panel para esta empresa."
        action={<Button onClick={openCreateDialog}>Agregar usuario</Button>}
      />

      <FilterBar
        search={
          <SearchInput
            value={table.searchInput}
            onChange={handleSearchChange}
            onSearch={handleSearch}
            placeholder="Nombre o email"
            label="Buscar"
          />
        }
        activeFilterCount={activeSecondaryFilterCount}
        onClearFilters={handleClearSecondaryFilters}
      >
        <FilterBar.Item>
          <Select
            label="Rol"
            value={table.state.role}
            onChange={(value) => {
              if (!value) {
                return;
              }
              table.setField("role", value);
            }}
            data={[
              { value: "all", label: "Todos" },
              ...Object.entries(companyRoleLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <Select
            label="Estado"
            value={table.state.status}
            onChange={(value) => {
              if (!value) {
                return;
              }
              table.setField("status", value);
            }}
            data={[
              { value: "all", label: "Todos" },
              { value: "ACTIVE", label: "Activo" },
              { value: "INACTIVE", label: "Inactivo" },
            ]}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        rows={usersQuery.data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.userId}
        loading={usersQuery.isPending}
        error={usersQuery.isError ? getApiErrorMessage(usersQuery.error) : undefined}
        emptyTitle="No hay usuarios"
        emptyDescription="Agregá el primer usuario con acceso al panel de esta empresa."
        aria-label="Usuarios de empresa"
        mobileView="cards"
        mobileCard={mobileCard}
        rowActions={(user) => {
          const items: ActionMenuItem[] = [
            {
              key: "edit",
              label: "Editar",
              onClick: () => openEditDialog(user),
            },
          ];
          if (user.membershipStatus === "ACTIVE") {
            items.push({
              key: "deactivate",
              label: "Desactivar",
              destructive: true,
              onClick: () => setDeactivateTarget(user),
            });
          }
          return (
            <ActionMenu
              primary={
                <Button size="compact-sm" variant="light" onClick={() => openEditDialog(user)}>
                  Editar
                </Button>
              }
              items={items.filter((item) => item.key !== "edit")}
              menuLabel={`Más acciones de ${user.name}`}
            />
          );
        }}
        pagination={
          usersQuery.data && usersQuery.data.data.length > 0 ? (
            <PaginationControls
              meta={mapApiPaginationMeta(usersQuery.data.meta)}
              onPageChange={table.onPageChange}
              pageSize={table.pageSize}
              onPageSizeChange={table.onPageSizeChange}
              showPageSizeSelector
            />
          ) : undefined
        }
      />

      <CompanyUserDialog
        open={dialogOpen}
        mode={dialogMode}
        initialUser={selectedUser}
        loading={createMutation.isPending || updateMutation.isPending}
        errorMessage={dialogError}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
      />

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Desactivar acceso"
        description={
          deactivateTarget?.companyRole === "OWNER"
            ? `¿Desactivar el acceso de ${deactivateTarget?.name}? Si es el último dueño activo, la operación será rechazada.`
            : `¿Desactivar el acceso de ${deactivateTarget?.name} a esta empresa?`
        }
        confirmLabel="Desactivar"
        destructive
        loading={deactivateMutation.isPending}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </>
  );
}
