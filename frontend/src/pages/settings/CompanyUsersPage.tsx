import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { FilterItem, ListFilters } from "../../components/common/ListFilters";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { PaginationControls } from "../../components/common/PaginationControls";
import { SearchField } from "../../components/common/SearchField";
import { StatusChip } from "../../components/common/StatusChip";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import {
  useCompanyPermissions,
  useCompanyUsers,
  useCreateCompanyUser,
  useDeactivateCompanyUser,
  useUpdateCompanyUser,
} from "../../hooks/useCompanyUsers";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { CompanyUser, CreateCompanyUserInput } from "../../types/company-user";
import { getApiErrorMessage } from "../../utils/errors";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";
import { formatDate } from "../../utils/dates";
import { CompanyUserDialog } from "./CompanyUserDialog";

export function CompanyUsersPage() {
  const pagination = usePaginationState(10);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<CompanyUser | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const permissionsQuery = useCompanyPermissions();
  const canManageUsers = permissionsQuery.data?.permissions.includes("users:manage") ?? false;

  const filters = useMemo(
    () => ({
      page: pagination.page,
      limit: pagination.pageSize,
      search: search || undefined,
      role: roleFilter === "all" ? undefined : (roleFilter as CompanyUser["companyRole"]),
      status:
        statusFilter === "all" ? undefined : (statusFilter as CompanyUser["membershipStatus"]),
    }),
    [pagination.page, pagination.pageSize, roleFilter, search, statusFilter],
  );

  const usersQuery = useCompanyUsers(filters, canManageUsers);
  const createMutation = useCreateCompanyUser();
  const updateMutation = useUpdateCompanyUser();
  const deactivateMutation = useDeactivateCompanyUser();

  const handleSearch = useCallback(
    (value: string) => {
      pagination.resetPage();
      setSearch(value);
    },
    [pagination],
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
        setSuccessMessage(
          result.message ||
            "Usuario creado. Recordá compartir de forma segura la contraseña temporal que ingresaste.",
        );
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
      setSuccessMessage("Usuario actualizado.");
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
      setSuccessMessage("Acceso desactivado.");
    } catch (error) {
      setDialogError(getApiErrorMessage(error));
      setDeactivateTarget(null);
    }
  };

  if (permissionsQuery.isPending) {
    return (
      <LoadingState message="Verificando permisos..." />
    );
  }

  if (!canManageUsers) {
    return (
      <ErrorState message="No tenés permisos para gestionar usuarios de esta empresa." />
    );
  }

  return (
    <>
      <PageHeader
        title="Usuarios de empresa"
        description="Gestioná los usuarios que tienen acceso al panel para esta empresa."
        action={
          <Button variant="contained" onClick={openCreateDialog}>
            Agregar usuario
          </Button>
        }
      />

      <ListFilters>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <SearchField placeholder="Nombre o email" onSearch={handleSearch} fullWidth />
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="company-user-role-filter">Rol</InputLabel>
            <Select
              labelId="company-user-role-filter"
              label="Rol"
              value={roleFilter}
              onChange={(event) => {
                pagination.resetPage();
                setRoleFilter(event.target.value);
              }}
            >
              <MenuItem value="all">Todos</MenuItem>
              {Object.entries(companyRoleLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterItem>
        <FilterItem size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth>
            <InputLabel id="company-user-status-filter">Estado</InputLabel>
            <Select
              labelId="company-user-status-filter"
              label="Estado"
              value={statusFilter}
              onChange={(event) => {
                pagination.resetPage();
                setStatusFilter(event.target.value);
              }}
            >
              <MenuItem value="all">Todos</MenuItem>
              <MenuItem value="ACTIVE">Activo</MenuItem>
              <MenuItem value="INACTIVE">Inactivo</MenuItem>
            </Select>
          </FormControl>
        </FilterItem>
      </ListFilters>

      {usersQuery.isPending ? <LoadingState /> : null}
      {usersQuery.isError ? <ErrorState message={getApiErrorMessage(usersQuery.error)} /> : null}

      {usersQuery.data && usersQuery.data.data.length === 0 ? (
        <EmptyState
          title="No hay usuarios"
          description="Agregá el primer usuario con acceso al panel de esta empresa."
        />
      ) : null}

      {usersQuery.data && usersQuery.data.data.length > 0 ? (
        <>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small" aria-label="Usuarios de empresa">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Rol</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Predeterminada</TableCell>
                  <TableCell>Actualizado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {usersQuery.data.data.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{companyRoleLabels[user.companyRole]}</TableCell>
                    <TableCell>
                      <StatusChip
                        label={membershipStatusLabels[user.membershipStatus]}
                        color={user.membershipStatus === "ACTIVE" ? "success" : "default"}
                      />
                    </TableCell>
                    <TableCell>{user.isDefault ? "Sí" : "No"}</TableCell>
                    <TableCell>{formatDate(user.updatedAt)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={() => openEditDialog(user)}>
                          Editar
                        </Button>
                        {user.membershipStatus === "ACTIVE" ? (
                          <Button
                            size="small"
                            color="error"
                            onClick={() => setDeactivateTarget(user)}
                          >
                            Desactivar
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <PaginationControls
            meta={usersQuery.data.meta}
            onPageChange={pagination.onPageChange}
            pageSize={pagination.pageSize}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector
          />
        </>
      ) : null}

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
        loading={deactivateMutation.isPending}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />

      <FeedbackSnackbar
        open={Boolean(successMessage)}
        message={successMessage ?? ""}
        onClose={() => setSuccessMessage(null)}
      />
    </>
  );
}
