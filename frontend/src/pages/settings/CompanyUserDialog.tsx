import { Button, Group, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { RoleSelectWithPermissions } from "../../components/company/RolePermissionsAction";
import { ResponsiveModal } from "../../design-system";
import type { CompanyRole, CompanyUser, UpdateCompanyUserInput } from "../../types/company-user";
import type { CreateCompanyInvitationInput } from "../../types/user-invitation";
import { COMPANY_ROLES } from "../../utils/company-role-hierarchy";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CompanyUserDialogCapabilities = {
  canEditProfile: boolean;
  canChangeRole: boolean;
  canChangeDefaultCompany: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
};

interface CompanyUserDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading?: boolean;
  errorMessage?: string | null;
  assignableRoles?: CompanyRole[];
  capabilities?: CompanyUserDialogCapabilities;
  onClose: () => void;
  onSubmit: (input: CreateCompanyInvitationInput | UpdateCompanyUserInput) => void;
  onRequestDeactivate?: () => void;
  onRequestReactivate?: () => void;
}

interface CompanyUserDialogFormProps {
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading: boolean;
  errorMessage?: string | null;
  assignableRoles: CompanyRole[];
  capabilities: CompanyUserDialogCapabilities;
  onClose: () => void;
  onSubmit: CompanyUserDialogProps["onSubmit"];
  onRequestDeactivate?: () => void;
  onRequestReactivate?: () => void;
}

const DEFAULT_CAPABILITIES: CompanyUserDialogCapabilities = {
  canEditProfile: true,
  canChangeRole: true,
  canChangeDefaultCompany: true,
  canDeactivate: true,
  canReactivate: false,
};

function CompanyUserDialogForm({
  mode,
  initialUser,
  loading,
  errorMessage,
  assignableRoles,
  capabilities,
  onClose,
  onSubmit,
  onRequestDeactivate,
  onRequestReactivate,
}: CompanyUserDialogFormProps) {
  const defaultRole = assignableRoles[0] ?? "READ_ONLY";
  const [name, setName] = useState(() =>
    mode === "edit" && initialUser ? initialUser.name : "",
  );
  const [email, setEmail] = useState(() =>
    mode === "edit" && initialUser ? initialUser.email : "",
  );
  const [role, setRole] = useState<CompanyRole>(() => {
    if (mode === "edit" && initialUser) {
      return initialUser.companyRole;
    }
    return assignableRoles.includes("ADMIN") ? "ADMIN" : defaultRole;
  });
  const [isDefault, setIsDefault] = useState(() =>
    mode === "edit" && initialUser ? initialUser.isDefault : false,
  );
  const [phoneNumber, setPhoneNumber] = useState(() =>
    mode === "edit" && initialUser ? (initialUser.phoneNumber ?? "") : "",
  );

  const status = initialUser?.membershipStatus ?? "ACTIVE";
  const isCreateMode = mode === "create";
  const canChangeRole = isCreateMode || capabilities.canChangeRole;
  const canEditProfile = isCreateMode || capabilities.canEditProfile;

  const roleOptions = useMemo(
    () =>
      assignableRoles.map((companyRole) => ({
        value: companyRole,
        label: companyRoleLabels[companyRole],
      })),
    [assignableRoles],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (canEditProfile) {
      if (!email.trim()) {
        errors.push("El email es obligatorio.");
      } else if (!EMAIL_PATTERN.test(email.trim())) {
        errors.push("Ingresá un email válido.");
      }
      if (!name.trim()) {
        errors.push("El nombre es obligatorio.");
      }
    }
    return errors;
  }, [canEditProfile, email, name]);

  const isValid = validationErrors.length === 0 && Boolean(role);

  const handleSubmit = () => {
    if (!isValid || loading) {
      return;
    }

    if (isCreateMode) {
      onSubmit({
        name: name.trim(),
        email: email.trim(),
        role,
      });
      return;
    }

    const payload: UpdateCompanyUserInput = {};
    if (capabilities.canEditProfile) {
      payload.name = name.trim();
      payload.email = email.trim();
      payload.phoneNumber = phoneNumber.trim() ? phoneNumber.trim() : null;
    }
    if (capabilities.canChangeRole) {
      payload.role = role;
    }
    if (capabilities.canChangeDefaultCompany) {
      payload.isDefault = isDefault;
    }
    // Never send status from the form — inactivation uses ConfirmDialog + deactivate API.
    onSubmit(payload);
  };

  return (
    <Stack gap="md">
      {isCreateMode ? (
        <Text size="sm" c="dimmed">
          Enviaremos una invitación por correo. Si la persona ya tiene cuenta, podrá aceptar con su
          usuario existente; si no, completará el alta desde el enlace.
        </Text>
      ) : null}

      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
        required={canEditProfile}
        disabled={!isCreateMode && !canEditProfile}
        description={
          isCreateMode
            ? "Se usará para enviar la invitación."
            : !canEditProfile
              ? "Solo el propio usuario o un superadmin de plataforma puede cambiar el email."
              : undefined
        }
      />
      <TextInput
        label="Nombre"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        required={canEditProfile}
        disabled={!isCreateMode && !canEditProfile}
      />

      {canChangeRole ? (
        <RoleSelectWithPermissions role={role}>
          <Select
            label="Rol en la empresa"
            data={roleOptions}
            value={role}
            onChange={(value) => setRole((value ?? "ADMIN") as CompanyRole)}
          />
        </RoleSelectWithPermissions>
      ) : (
        <TextInput
          label="Rol en la empresa"
          value={companyRoleLabels[role] ?? role}
          disabled
        />
      )}

      {mode === "edit" ? (
        <>
          <TextInput
            label="Teléfono WhatsApp (E.164)"
            placeholder="+5491112345678"
            description="Usado para alertas administrativas de la empresa."
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.currentTarget.value)}
            disabled={!canEditProfile}
          />
          <TextInput
            label="Estado"
            value={membershipStatusLabels[status] ?? status}
            disabled
            description="Para desactivar el acceso usá el botón Desactivar (requiere confirmación)."
          />
          {capabilities.canChangeDefaultCompany ? (
            <Switch
              label="Empresa predeterminada para este usuario"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.currentTarget.checked)}
            />
          ) : null}
        </>
      ) : null}
      {validationErrors.length > 0 ? (
        <Text size="sm" c="red">
          {validationErrors.join(" ")}
        </Text>
      ) : null}
      {errorMessage ? (
        <Text size="sm" c="red">
          {errorMessage}
        </Text>
      ) : null}

      <Group justify="space-between" gap="sm">
        <Group gap="sm">
          {mode === "edit" && capabilities.canDeactivate && onRequestDeactivate ? (
            <Button
              color="red"
              variant="light"
              onClick={onRequestDeactivate}
              disabled={loading}
            >
              Desactivar
            </Button>
          ) : null}
          {mode === "edit" && capabilities.canReactivate && onRequestReactivate ? (
            <Button variant="light" onClick={onRequestReactivate} disabled={loading}>
              Reactivar
            </Button>
          ) : null}
        </Group>
        <Group gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !isValid} loading={loading}>
            {mode === "create" ? "Enviar invitación" : "Guardar"}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

export function CompanyUserDialog({
  open,
  mode,
  initialUser,
  loading = false,
  errorMessage,
  assignableRoles = [...COMPANY_ROLES],
  capabilities = DEFAULT_CAPABILITIES,
  onClose,
  onSubmit,
  onRequestDeactivate,
  onRequestReactivate,
}: CompanyUserDialogProps) {
  const formKey =
    open && mode === "edit" && initialUser
      ? `edit-${initialUser.userId}`
      : open
        ? "create"
        : "closed";

  return (
    <ResponsiveModal
      opened={open}
      onClose={loading ? () => undefined : onClose}
      title={mode === "create" ? "Invitar usuario" : "Editar usuario"}
      bodyMode="scroll"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      {open ? (
        <CompanyUserDialogForm
          key={formKey}
          mode={mode}
          initialUser={initialUser}
          loading={loading}
          errorMessage={errorMessage}
          assignableRoles={assignableRoles}
          capabilities={capabilities}
          onClose={onClose}
          onSubmit={onSubmit}
          onRequestDeactivate={onRequestDeactivate}
          onRequestReactivate={onRequestReactivate}
        />
      ) : null}
    </ResponsiveModal>
  );
}
