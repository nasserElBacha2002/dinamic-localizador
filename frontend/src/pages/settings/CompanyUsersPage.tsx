import { Button, Group, Select } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "../../design-system";
import {
  DataTable,
  ErrorState,
  FilterBar,
  LoadingState,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import {
  useCompanyPermissions,
  useCompanyUsers,
  useCreateCompanyUser,
  useDeactivateCompanyUser,
  useUpdateCompanyUser,
} from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { CompanyUser, CreateCompanyUserInput } from "../../types/company-user";
import { formatDate } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";
import { CompanyUserDialog } from "./CompanyUserDialog";

export function CompanyUsersPage() {
  const pagination = usePaginationState(10);
  const { resetPage, page, pageSize, onPageChange, onPageSizeChange } = pagination;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CompanyUser | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const permissionsQuery = useCompanyPermissions();
  const canManageUsers = permissionsQuery.data?.permissions.includes("users:manage") ?? false;

  const filters = useMemo(
    () => ({
      page,
      limit: pageSize,
      search: search || undefined,
      role: roleFilter === "all" ? undefined : (roleFilter as CompanyUser["companyRole"]),
      status:
        statusFilter === "all" ? undefined : (statusFilter as CompanyUser["membershipStatus"]),
    }),
    [page, pageSize, roleFilter, search, statusFilter],
  );

  const usersQuery = useCompanyUsers(filters, canManageUsers);
  const createMutation = useCreateCompanyUser();
  const updateMutation = useUpdateCompanyUser();
  const deactivateMutation = useDeactivateCompanyUser();

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
        action={
          <Button onClick={openCreateDialog}>Agregar usuario</Button>
        }
      />

      <FilterBar>
        <FilterBar.Item>
          <SearchInput
            value={searchInput}
            onChange={handleSearchChange}
            onSearch={handleSearch}
            placeholder="Nombre o email"
            label="Buscar"
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <Select
            label="Rol"
            value={roleFilter}
            onChange={(value) => {
              if (!value) {
                return;
              }
              resetPage();
              setRoleFilter(value);
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
            value={statusFilter}
            onChange={(value) => {
              if (!value) {
                return;
              }
              resetPage();
              setStatusFilter(value);
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
        rowActions={(user) => (
          <Group gap="xs" justify="flex-end">
            <Button size="compact-sm" variant="light" onClick={() => openEditDialog(user)}>
              Editar
            </Button>
            {user.membershipStatus === "ACTIVE" ? (
              <Button
                size="compact-sm"
                variant="light"
                color="red"
                onClick={() => setDeactivateTarget(user)}
              >
                Desactivar
              </Button>
            ) : null}
          </Group>
        )}
        pagination={
          usersQuery.data && usersQuery.data.data.length > 0 ? (
            <PaginationControls
              meta={mapApiPaginationMeta(usersQuery.data.meta)}
              onPageChange={onPageChange}
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
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
