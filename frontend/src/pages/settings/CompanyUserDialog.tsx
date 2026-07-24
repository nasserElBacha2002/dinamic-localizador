import { Button, Group, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { ResponsiveModal } from "../../design-system";
import type { CompanyRole, CompanyUser, CreateCompanyUserInput } from "../../types/company-user";
import { companyRoleLabels } from "../../utils/labels";

const COMPANY_ROLES: CompanyRole[] = [
  "OWNER",
  "ADMIN",
  "HR",
  "SUPERVISOR",
  "OPERATOR",
  "READ_ONLY",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CompanyUserDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (
    input:
      | CreateCompanyUserInput
      | { role: CompanyRole; status: CompanyUser["membershipStatus"]; isDefault: boolean },
  ) => void;
}

interface CompanyUserDialogFormProps {
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: CompanyUserDialogProps["onSubmit"];
}

function CompanyUserDialogForm({
  mode,
  initialUser,
  loading,
  errorMessage,
  onClose,
  onSubmit,
}: CompanyUserDialogFormProps) {
  const [name, setName] = useState(() =>
    mode === "edit" && initialUser ? initialUser.name : "",
  );
  const [email, setEmail] = useState(() =>
    mode === "edit" && initialUser ? initialUser.email : "",
  );
  const [role, setRole] = useState<CompanyRole>(() =>
    mode === "edit" && initialUser ? initialUser.companyRole : "ADMIN",
  );
  const [status, setStatus] = useState<CompanyUser["membershipStatus"]>(() =>
    mode === "edit" && initialUser ? initialUser.membershipStatus : "ACTIVE",
  );
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isDefault, setIsDefault] = useState(() =>
    mode === "edit" && initialUser ? initialUser.isDefault : false,
  );

  const roleOptions = useMemo(
    () => COMPANY_ROLES.map((companyRole) => ({
      value: companyRole,
      label: companyRoleLabels[companyRole],
    })),
    [],
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
      if (!temporaryPassword || temporaryPassword.length < 8) {
        errors.push("La contraseña temporal debe tener al menos 8 caracteres.");
      }
      return errors;
    }

    return [];
  }, [email, mode, name, temporaryPassword]);

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
        status,
        temporaryPassword,
        isDefault,
      });
      return;
    }

    onSubmit({ role, status, isDefault });
  };

  const handleClose = () => {
    setTemporaryPassword("");
    onClose();
  };

  return (
    <Stack gap="md">
      {mode === "create" ? (
        <>
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
          />
          <Text size="sm" c="dimmed">
            Se usará solo si el usuario no existe todavía. Si el usuario ya existe, se agregará su
            acceso a esta empresa.
          </Text>
          <TextInput
            label="Contraseña temporal"
            type="password"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.currentTarget.value)}
            required
            description="Obligatoria en el formulario. El backend la ignora si el usuario ya existe."
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
        <Select
          label="Estado"
          data={[
            { value: "ACTIVE", label: "Activo" },
            { value: "INACTIVE", label: "Inactivo" },
          ]}
          value={status}
          onChange={(value) => setStatus((value ?? "ACTIVE") as CompanyUser["membershipStatus"])}
        />
      ) : null}

      <Switch
        label="Empresa predeterminada para este usuario"
        checked={isDefault}
        onChange={(event) => setIsDefault(event.currentTarget.checked)}
      />

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
        <Button variant="default" onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading || !isValid} loading={loading}>
          Guardar
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
      title={mode === "create" ? "Agregar usuario" : "Editar usuario"}
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
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </ResponsiveModal>
  );
}
