import { Button, Group, Paper, Select, Stack, Text, Title, Tooltip } from "@mantine/core";
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
import { useAuth } from "../../hooks/useAuth";
import {
  useCompanyInvitations,
  useCreateCompanyInvitation,
  useResendCompanyInvitation,
  useRevokeCompanyInvitation,
} from "../../hooks/useInvitations";
import {
  useCompanyPermissions,
  useCompanyUsers,
  useDeactivateCompanyUser,
  useUpdateCompanyUser,
} from "../../hooks/useCompanyUsers";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { CompanyRole, CompanyUser } from "../../types/company-user";
import type {
  CreateCompanyInvitationInput,
  UserInvitationSummary,
} from "../../types/user-invitation";
import {
  getCompanyUserEditBlockReason,
  listAssignableCompanyRoles,
  USER_EDIT_HIERARCHY_BLOCKED_MESSAGE,
  USER_SELF_EDIT_BLOCKED_MESSAGE,
} from "../../utils/company-role-hierarchy";
import { formatDate } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";
import {
  COMPANY_USERS_TABLE_DEFAULTS,
  COMPANY_USERS_TABLE_FIELDS,
} from "./company-users-table-state";
import { CompanyUserDialog } from "./CompanyUserDialog";

const ALL_COMPANY_ROLES: CompanyRole[] = [
  "OWNER",
  "ADMIN",
  "HR",
  "SUPERVISOR",
  "OPERATOR",
  "READ_ONLY",
];

export function CompanyUsersPage() {
  const { user: authUser } = useAuth();
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
  const actorRole = permissionsQuery.data?.role;
  const actorIsPlatformAdmin =
    Boolean(authUser?.isPlatformAdmin) || Boolean(permissionsQuery.data?.isPlatformAdmin);

  const assignableRoles = useMemo(
    () => listAssignableCompanyRoles(actorRole, actorIsPlatformAdmin, ALL_COMPANY_ROLES),
    [actorIsPlatformAdmin, actorRole],
  );

  const canEditUser = useCallback(
    (target: CompanyUser) =>
      getCompanyUserEditBlockReason({
        actorUserId: authUser?.id,
        actorRole,
        actorIsPlatformAdmin,
        targetUserId: target.userId,
        targetRole: target.companyRole,
      }) === null,
    [actorIsPlatformAdmin, actorRole, authUser?.id],
  );

  const editBlockMessageFor = useCallback(
    (target: CompanyUser) => {
      const reason = getCompanyUserEditBlockReason({
        actorUserId: authUser?.id,
        actorRole,
        actorIsPlatformAdmin,
        targetUserId: target.userId,
        targetRole: target.companyRole,
      });
      if (reason === "self") {
        return USER_SELF_EDIT_BLOCKED_MESSAGE;
      }
      return USER_EDIT_HIERARCHY_BLOCKED_MESSAGE;
    },
    [actorIsPlatformAdmin, actorRole, authUser?.id],
  );

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
  const pendingInvitationsQuery = useCompanyInvitations(
    { status: "PENDING", limit: 20, page: 1 },
    canManageUsers,
  );
  const createMutation = useCreateCompanyInvitation();
  const updateMutation = useUpdateCompanyUser();
  const deactivateMutation = useDeactivateCompanyUser();
  const resendInvitationMutation = useResendCompanyInvitation();
  const revokeInvitationMutation = useRevokeCompanyInvitation();

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
    if (!canEditUser(user)) {
      notifications.show({
        color: "yellow",
        message: editBlockMessageFor(user),
      });
      return;
    }
    setDialogMode("edit");
    setSelectedUser(user);
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleDialogSubmit = async (
    input:
      | CreateCompanyInvitationInput
      | { role: CompanyUser["companyRole"]; status: CompanyUser["membershipStatus"]; isDefault: boolean },
  ) => {
    setDialogError(null);

    try {
      if (dialogMode === "create") {
        const result = await createMutation.mutateAsync(input as CreateCompanyInvitationInput);
        setDialogOpen(false);
        notifications.show({
          color: "green",
          message:
            result.message ||
            (result.data.emailSent
              ? "Invitación enviada por correo."
              : "Invitación creada, pero no se pudo enviar el correo. Podés reenviarla desde la lista de pendientes."),
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

  const handleResendInvitation = async (invitation: UserInvitationSummary) => {
    try {
      const result = await resendInvitationMutation.mutateAsync(invitation.id);
      notifications.show({
        color: "green",
        message:
          result.message ||
          (result.data.emailSent
            ? "Invitación reenviada."
            : "No se pudo reenviar el correo. Intentá nuevamente más tarde."),
      });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  const handleRevokeInvitation = async (invitation: UserInvitationSummary) => {
    try {
      const result = await revokeInvitationMutation.mutateAsync(invitation.id);
      notifications.show({ color: "green", message: result.message || "Invitación revocada." });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
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
        action={<Button onClick={openCreateDialog}>Invitar usuario</Button>}
      />

      {pendingInvitationsQuery.data && pendingInvitationsQuery.data.data.length > 0 ? (
        <Paper withBorder p="md" mb="lg" radius="md">
          <Stack gap="sm">
            <Title order={4}>Invitaciones pendientes</Title>
            <Text size="sm" c="dimmed">
              Invitaciones enviadas que aún no fueron aceptadas.
            </Text>
            {pendingInvitationsQuery.data.data.map((invitation) => (
              <Group key={invitation.id} justify="space-between" align="flex-start" wrap="wrap">
                <Stack gap={2}>
                  <Text size="sm" fw={500}>
                    {invitation.email}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {companyRoleLabels[invitation.role]} · vence {formatDate(invitation.expiresAt)}
                    {invitation.deliveryStatus === "FAILED"
                      ? " · correo pendiente de entrega"
                      : invitation.deliveryStatus === "SENT"
                        ? " · correo enviado"
                        : ""}
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Button
                    size="compact-sm"
                    variant="light"
                    loading={resendInvitationMutation.isPending}
                    onClick={() => void handleResendInvitation(invitation)}
                  >
                    Reenviar
                  </Button>
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    color="red"
                    loading={revokeInvitationMutation.isPending}
                    onClick={() => void handleRevokeInvitation(invitation)}
                  >
                    Revocar
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        </Paper>
      ) : null}

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
        activeFilterCount={table.activeFilterCount}
        onClearFilters={table.resetFilters}
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
          const allowed = canEditUser(user);
          const blockedMessage = editBlockMessageFor(user);
          const items: ActionMenuItem[] = [];
          if (user.membershipStatus === "ACTIVE") {
            items.push({
              key: "deactivate",
              label: "Desactivar",
              destructive: true,
              disabled: !allowed,
              onClick: () => {
                if (!allowed) {
                  notifications.show({
                    color: "yellow",
                    message: blockedMessage,
                  });
                  return;
                }
                setDeactivateTarget(user);
              },
            });
          }
          const editButton = (
            <Button
              size="compact-sm"
              variant="light"
              disabled={!allowed}
              onClick={() => openEditDialog(user)}
            >
              Editar
            </Button>
          );
          return (
            <ActionMenu
              primary={
                allowed ? (
                  editButton
                ) : (
                  <Tooltip label={blockedMessage} multiline maw={280}>
                    <span>{editButton}</span>
                  </Tooltip>
                )
              }
              items={items}
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
        assignableRoles={assignableRoles}
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
