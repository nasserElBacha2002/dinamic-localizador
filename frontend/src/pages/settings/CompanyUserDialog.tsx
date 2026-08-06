import { Button, Group, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type { CompanyRole, CompanyUser } from "../../types/company-user";
import type { CreateCompanyInvitationInput } from "../../types/user-invitation";
import { COMPANY_ROLES } from "../../utils/company-role-hierarchy";
import { companyRoleLabels } from "../../utils/labels";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


interface CompanyUserDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading?: boolean;
  errorMessage?: string | null;
  /** Roles the actor may assign (strictly below actor rank). */
  assignableRoles?: CompanyRole[];
  onClose: () => void;
  onSubmit: (
    input:
      | CreateCompanyInvitationInput
      | { role: CompanyRole; status: CompanyUser["membershipStatus"]; isDefault: boolean },
  ) => void;
}

interface CompanyUserDialogFormProps {
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading: boolean;
  errorMessage?: string | null;
  assignableRoles: CompanyRole[];
  onClose: () => void;
  onSubmit: CompanyUserDialogProps["onSubmit"];
}

function CompanyUserDialogForm({
  mode,
  initialUser,
  loading,
  errorMessage,
  assignableRoles,
  onClose,
  onSubmit,
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
      return assignableRoles.includes(initialUser.companyRole)
        ? initialUser.companyRole
        : defaultRole;
    }
    return assignableRoles.includes("ADMIN") ? "ADMIN" : defaultRole;
  });
  const [status, setStatus] = useState<CompanyUser["membershipStatus"]>(() =>
    mode === "edit" && initialUser ? initialUser.membershipStatus : "ACTIVE",
  );
  const [isDefault, setIsDefault] = useState(() =>
    mode === "edit" && initialUser ? initialUser.isDefault : false,
  );

  const roleOptions = useMemo(
    () =>
      assignableRoles.map((companyRole) => ({
        value: companyRole,
        label: companyRoleLabels[companyRole],
      })),
    [assignableRoles],
  );

  const validationErrors = useMemo(() => {
    if (mode === "create") {
      const errors: string[] = [];
      if (!email.trim()) {
        errors.push("El email es obligatorio.");
      } else if (!EMAIL_PATTERN.test(email.trim())) {
        errors.push("Ingresá un email válido.");
      }
      if (!name.trim()) {
        errors.push("El nombre es obligatorio.");
      }
      return errors;
    }

    return [];
  }, [email, mode, name]);

  const isValid = mode === "create" ? validationErrors.length === 0 : Boolean(role && status);

  const handleSubmit = () => {
    if (!isValid || loading) {
      return;
    }

    if (mode === "create") {
      onSubmit({
        name: name.trim(),
        email: email.trim(),
        role,
      });
      return;
    }

    onSubmit({ role, status, isDefault });
  };

  return (
    <Stack gap="md">
      {mode === "create" ? (
        <>
          <Text size="sm" c="dimmed">
            Enviaremos una invitación por correo. Si la persona ya tiene cuenta, podrá aceptar con su
            usuario existente; si no, completará el alta desde el enlace.
          </Text>
          <TextInput
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
          <TextInput
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            description="Se usará si la persona aún no tiene cuenta en la plataforma."
          />
        </>
      ) : (
        <>
          <TextInput label="Nombre" value={name} disabled />
          <TextInput label="Email" value={email} disabled />
        </>
      )}

      <Select
        label="Rol en la empresa"
        data={roleOptions}
        value={role}
        onChange={(value) => setRole((value ?? "ADMIN") as CompanyRole)}
      />

      {mode === "edit" ? (
        <>
          <Select
            label="Estado"
            data={[
              { value: "ACTIVE", label: "Activo" },
              { value: "INACTIVE", label: "Inactivo" },
            ]}
            value={status}
            onChange={(value) => setStatus((value ?? "ACTIVE") as CompanyUser["membershipStatus"])}
          />
          <Switch
            label="Empresa predeterminada para este usuario"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.currentTarget.checked)}
          />
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

      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading || !isValid} loading={loading}>
          {mode === "create" ? "Enviar invitación" : "Guardar"}
        </Button>
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
  onClose,
  onSubmit,
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
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </ResponsiveModal>
  );
}
