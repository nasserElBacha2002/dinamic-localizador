import { Button, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import {
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
import type { CompanyUser, UpdateCompanyUserInput } from "../../types/company-user";
import type {
  CreateCompanyInvitationInput,
  UserInvitationSummary,
} from "../../types/user-invitation";
import {
  listAssignableCompanyRoles,
  listInvitableCompanyRoles,
  resolveCompanyUserCapabilities,
} from "../../utils/company-role-hierarchy";
import { formatDate } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";
import {
  COMPANY_USERS_TABLE_DEFAULTS,
  COMPANY_USERS_TABLE_FIELDS,
} from "./company-users-table-state";
import { CompanyUserDialog } from "./CompanyUserDialog";

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

  const assignableRoles = useMemo(() => {
    if (permissionsQuery.data?.assignableRoles?.length) {
      return permissionsQuery.data.assignableRoles;
    }
    return listAssignableCompanyRoles(actorRole, actorIsPlatformAdmin);
  }, [actorIsPlatformAdmin, actorRole, permissionsQuery.data]);

  const invitableRoles = useMemo(() => {
    if (permissionsQuery.data?.invitableRoles?.length) {
      return permissionsQuery.data.invitableRoles;
    }
    return listInvitableCompanyRoles(actorRole, actorIsPlatformAdmin);
  }, [actorIsPlatformAdmin, actorRole, permissionsQuery.data]);

  const dialogRoles = dialogMode === "create" ? invitableRoles : assignableRoles;

  const capabilitiesFor = useCallback(
    (target: CompanyUser) =>
      resolveCompanyUserCapabilities({
        actorUserId: authUser?.id,
        actorRole,
        actorIsPlatformAdmin,
        targetUserId: target.userId,
        targetRole: target.companyRole,
        targetStatus: target.membershipStatus,
      }),
    [actorIsPlatformAdmin, actorRole, authUser?.id],
  );

  const selectedCapabilities = useMemo(() => {
    if (!selectedUser) {
      return {
        canEditProfile: true,
        canChangeRole: true,
        canChangeDefaultCompany: true,
        canDeactivate: false,
        canReactivate: false,
      };
    }
    return capabilitiesFor(selectedUser);
  }, [capabilitiesFor, selectedUser]);

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
    setDialogMode("edit");
    setSelectedUser(user);
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleDialogSubmit = async (
    input: CreateCompanyInvitationInput | UpdateCompanyUserInput,
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
        input: input as UpdateCompanyUserInput,
      });
      setDialogOpen(false);
      notifications.show({ color: "green", message: "Usuario actualizado." });
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) {
      return;
    }
    try {
      await deactivateMutation.mutateAsync(deactivateTarget.userId);
      setDeactivateTarget(null);
      setDialogOpen(false);
      notifications.show({ color: "green", message: "Acceso desactivado." });
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
      setDeactivateTarget(null);
    }
  };

  const handleReactivate = async () => {
    if (!selectedUser) {
      return;
    }
    setDialogError(null);
    try {
      await updateMutation.mutateAsync({
        userId: selectedUser.userId,
        input: { status: "ACTIVE" },
      });
      setDialogOpen(false);
      notifications.show({ color: "green", message: "Acceso reactivado." });
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
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
        key: "phoneNumber",
        header: "WhatsApp",
        getValue: (row) => row.phoneNumber ?? "—",
      },
      {
        key: "companyRole",
        header: "Rol",
        getValue: (row) => companyRoleLabels[row.companyRole] ?? row.companyRole,
      },
      {
        key: "membershipStatus",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={membershipStatusLabels[row.membershipStatus] ?? row.membershipStatus}
            tone={row.membershipStatus === "ACTIVE" ? "success" : "neutral"}
          />
        ),
      },
      {
        key: "lastLoginAt",
        header: "Último acceso",
        getValue: (row) => (row.lastLoginAt ? formatDate(row.lastLoginAt) : "—"),
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
          label={membershipStatusLabels[row.membershipStatus] ?? row.membershipStatus}
          tone={row.membershipStatus === "ACTIVE" ? "success" : "neutral"}
        />
      ),
      fields: [
        {
          key: "role",
          label: "Rol",
          getValue: (row) => companyRoleLabels[row.companyRole] ?? row.companyRole,
          visibility: "always",
        },
        {
          key: "phoneNumber",
          label: "WhatsApp",
          getValue: (row) => row.phoneNumber ?? "—",
          visibility: "always",
        },
      ],
    }),
    [],
  );

  if (permissionsQuery.isPending) {
    return <LoadingState message="Cargando permisos..." />;
  }

  if (permissionsQuery.isError) {
    return (
      <ErrorState
        title="No se pudieron cargar los permisos"
        message={getApiErrorMessage(permissionsQuery.error)}
        action={
          <Button variant="light" onClick={() => void permissionsQuery.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  if (!canManageUsers) {
    return (
      <ErrorState
        title="Sin permiso"
        message="No tenés permiso para administrar usuarios de esta empresa."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Administrá el acceso al panel de esta empresa."
        action={
          <Button onClick={openCreateDialog} disabled={invitableRoles.length === 0}>
            Invitar usuario
          </Button>
        }
      />

      {(pendingInvitationsQuery.data?.data.length ?? 0) > 0 ? (
        <Paper withBorder p="md" mb="md">
          <Stack gap="sm">
            <Title order={5}>Invitaciones pendientes</Title>
            {pendingInvitationsQuery.data?.data.map((invitation) => (
              <Group key={invitation.id} justify="space-between" wrap="wrap">
                <Text size="sm">
                  {invitation.inviteeName ?? invitation.email} —{" "}
                  {companyRoleLabels[invitation.role] ?? invitation.role}
                </Text>
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
            placeholder="Buscar por nombre o email"
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
              ...Object.entries(companyRoleLabels).map(([value, label]) => ({
                value,
                label,
              })),
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
        rowActions={(user) => (
          <Button size="compact-sm" variant="light" onClick={() => openEditDialog(user)}>
            Editar
          </Button>
        )}
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
        loading={
          createMutation.isPending ||
          updateMutation.isPending ||
          deactivateMutation.isPending
        }
        errorMessage={dialogError}
        assignableRoles={dialogRoles}
        capabilities={selectedCapabilities}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        onRequestDeactivate={
          selectedUser
            ? () => {
                setDeactivateTarget(selectedUser);
              }
            : undefined
        }
        onRequestReactivate={
          selectedCapabilities.canReactivate ? () => void handleReactivate() : undefined
        }
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
        onConfirm={() => void handleConfirmDeactivate()}
        onCancel={() => setDeactivateTarget(null)}
      />
    </>
  );
}
