import { Alert, Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { notifications } from "@mantine/notifications";
import { FormSection } from "../../design-system";
import {
  useEmployeeOperationalAccess,
  useInviteEmployeeOperationalAccess,
  useLinkEmployeeOperationalAccess,
  useRevokeEmployeeOperationalAccess,
} from "../../hooks/useEmployeeOperationalAccess";
import { useCompanyUsers } from "../../hooks/useCompanyUsers";
import { companyRoleLabels, membershipStatusLabels } from "../../utils/labels";
import { getApiErrorMessage } from "../../utils/errors";

interface EmployeeOperationalAccessSectionProps {
  employeeId: string;
  employeeName: string;
  visible: boolean;
}

export function EmployeeOperationalAccessSection({
  employeeId,
  employeeName,
  visible,
}: EmployeeOperationalAccessSectionProps) {
  const [userSearch, setUserSearch] = useState("");
  const accessQuery = useEmployeeOperationalAccess(employeeId, visible);
  const usersQuery = useCompanyUsers(
    { limit: 25, page: 1, status: "ACTIVE", search: userSearch.trim() || undefined },
    visible,
  );
  const linkMutation = useLinkEmployeeOperationalAccess(employeeId);
  const inviteMutation = useInviteEmployeeOperationalAccess(employeeId);
  const revokeMutation = useRevokeEmployeeOperationalAccess(employeeId);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");

  const userOptions = useMemo(
    () =>
      (usersQuery.data?.data ?? [])
        .filter((user) => user.membershipStatus === "ACTIVE")
        .map((user) => ({
          value: user.userId,
          label: `${user.name} (${user.email})`,
        })),
    [usersQuery.data?.data],
  );

  if (!visible) {
    return null;
  }

  const status = accessQuery.data;

  const handleLink = async () => {
    if (!selectedUserId) {
      return;
    }
    try {
      await linkMutation.mutateAsync(selectedUserId);
      notifications.show({ color: "green", message: "Acceso operativo vinculado." });
      setSelectedUserId(null);
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      return;
    }
    try {
      const result = await inviteMutation.mutateAsync({
        email: inviteEmail.trim(),
        inviteeName: inviteName.trim() || employeeName,
      });
      notifications.show({
        color: result.emailSent ? "green" : "yellow",
        message: result.emailSent
          ? "Invitación enviada por correo."
          : "Invitación creada; el correo no pudo enviarse.",
      });
      setInviteEmail("");
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  const handleRevoke = async () => {
    try {
      await revokeMutation.mutateAsync();
      notifications.show({ color: "green", message: "Acceso operativo revocado." });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  return (
    <FormSection title="Acceso al sistema" description="Habilitá el rol Encargado operativo en el panel.">
      <Stack gap="md">
        {!status?.eligible && (
          <Alert color="yellow">
            Guardá al colaborador con la categoría <strong>Encargado</strong> activa para habilitar el
            acceso.
          </Alert>
        )}

        {accessQuery.isLoading && <Text size="sm">Cargando estado de acceso…</Text>}

        {status?.link && (
          <Stack gap={4}>
            <Text size="sm">
              Usuario vinculado: <strong>{status.link.userName}</strong> ({status.link.userEmail})
            </Text>
            <Text size="sm" c="dimmed">
              Rol: {companyRoleLabels[status.link.companyRole] ?? status.link.companyRole} · Estado:{" "}
              {membershipStatusLabels[status.link.membershipStatus as keyof typeof membershipStatusLabels] ??
                status.link.membershipStatus}
            </Text>
            <Button
              color="red"
              variant="light"
              onClick={() => void handleRevoke()}
              loading={revokeMutation.isPending}
              disabled={!status.eligible}
            >
              Revocar acceso operativo
            </Button>
          </Stack>
        )}

        {!status?.link && status?.eligible && (
          <Stack gap="sm">
            <Select
              label="Vincular usuario existente"
              placeholder="Seleccionar usuario de la empresa"
              data={userOptions}
              value={selectedUserId}
              onChange={(value) => setSelectedUserId(value)}
              searchable
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              nothingFoundMessage={userSearch.trim() ? "Sin resultados" : "Escribí para buscar usuarios"}
            />
            <Group>
              <Button
                onClick={() => void handleLink()}
                loading={linkMutation.isPending}
                disabled={!selectedUserId}
              >
                Vincular
              </Button>
            </Group>

            <Text size="sm" fw={500} mt="sm">
              O invitar por correo
            </Text>
            <TextInput
              label="Correo"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.currentTarget.value)}
            />
            <TextInput
              label="Nombre en la invitación (opcional)"
              value={inviteName}
              onChange={(event) => setInviteName(event.currentTarget.value)}
            />
            <Button variant="light" onClick={() => void handleInvite()} loading={inviteMutation.isPending}>
              Enviar invitación
            </Button>
          </Stack>
        )}

        {status && status.pendingInvitations.length > 0 && (
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Invitaciones pendientes
            </Text>
            {status.pendingInvitations.map((invitation) => (
              <Text key={invitation.id} size="sm" c="dimmed">
                {invitation.email} — vence{" "}
                {new Date(invitation.expiresAt).toLocaleString("es-AR")}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </FormSection>
  );
}
