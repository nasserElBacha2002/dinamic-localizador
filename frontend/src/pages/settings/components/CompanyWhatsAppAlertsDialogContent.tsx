import {
  Button,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert } from "../../../design-system";
import {
  useCompanyAlertRecipients,
  useCreateCompanyAlertRecipient,
  useDeleteCompanyAlertRecipient,
  useUpdateCompanyAlertRecipient,
} from "../../../hooks/useCompanyAlertRecipients";
import { useCompanyUsers } from "../../../hooks/useCompanyUsers";
import { useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import type { CompanySettings } from "../../../types/company-settings";
import { getApiErrorMessage } from "../../../utils/errors";

interface CompanyWhatsAppAlertsDialogContentProps {
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyWhatsAppAlertsDialogContent({
  settings,
  canUpdate,
  onSaved,
}: CompanyWhatsAppAlertsDialogContentProps) {
  const recipientsQuery = useCompanyAlertRecipients(canUpdate);
  const usersQuery = useCompanyUsers(
    { status: "ACTIVE", limit: 200, page: 1 },
    canUpdate,
  );
  const createMutation = useCreateCompanyAlertRecipient();
  const updateMutation = useUpdateCompanyAlertRecipient();
  const deleteMutation = useDeleteCompanyAlertRecipient();
  const updateSettings = useUpdateCompanySettings();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [thresholdEnabled, setThresholdEnabled] = useState(
    settings.attendanceThresholdAlertsEnabled ?? false,
  );
  const [thresholdPercent, setThresholdPercent] = useState<number>(
    settings.attendanceAlertThresholdPercent ?? 80,
  );
  const [windowDays, setWindowDays] = useState<number>(settings.attendanceAlertWindowDays ?? 30);
  const [minimumWorkdays, setMinimumWorkdays] = useState<number>(
    settings.attendanceAlertMinimumWorkdays ?? 5,
  );
  const [cooldownDays, setCooldownDays] = useState<number>(
    settings.attendanceAlertCooldownDays ?? 7,
  );

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    updateSettings.isPending;

  const recipientUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const recipient of recipientsQuery.data ?? []) {
      if (recipient.userId) {
        ids.add(recipient.userId);
      }
    }
    return ids;
  }, [recipientsQuery.data]);

  const companyUsers = usersQuery.data?.data ?? [];

  const selectedUser = useMemo(
    () => companyUsers.find((user) => user.userId === selectedUserId) ?? null,
    [companyUsers, selectedUserId],
  );

  const userSelectData = useMemo(() => {
    return companyUsers
      .filter((user) => !recipientUserIds.has(user.userId))
      .map((user) => ({
        value: user.userId,
        label: user.phoneNumber
          ? `${user.name} (${user.email}) — ${user.phoneNumber}`
          : `${user.name} (${user.email}) — sin teléfono`,
        disabled: !user.phoneNumber,
      }));
  }, [companyUsers, recipientUserIds]);

  const handleToggleCompanyAlerts = async (checked: boolean) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateSettings.mutateAsync({ adminAlertsEnabled: checked });
      onSaved("Configuración de alertas actualizada.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleSaveThresholdSettings = async () => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateSettings.mutateAsync({
        attendanceThresholdAlertsEnabled: thresholdEnabled,
        attendanceAlertThresholdPercent: Number(thresholdPercent),
        attendanceAlertWindowDays: Number(windowDays),
        attendanceAlertMinimumWorkdays: Number(minimumWorkdays),
        attendanceAlertCooldownDays: Number(cooldownDays),
      });
      onSaved("Alertas por asistencia baja actualizadas.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleCreate = async () => {
    if (!canUpdate || !selectedUserId) {
      return;
    }
    if (!selectedUser?.phoneNumber?.trim()) {
      setSubmitError(
        "El usuario no tiene teléfono. Cargalo en Usuarios de la empresa antes de agregarlo.",
      );
      return;
    }
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({ userId: selectedUserId });
      setSelectedUserId(null);
      onSaved("Destinatario agregado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleToggleRecipient = async (recipientId: string, isEnabled: boolean) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({ recipientId, input: { isEnabled } });
      onSaved("Destinatario actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleToggleCategory = async (
    recipientId: string,
    field: "receiveOperationalAlerts" | "receiveRequestAlerts" | "receiveSecurityAlerts",
    value: boolean,
  ) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({ recipientId, input: { [field]: value } });
      onSaved("Preferencias actualizadas.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleDelete = async (recipientId: string) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await deleteMutation.mutateAsync(recipientId);
      onSaved("Destinatario desactivado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const startEditing = (recipientId: string, currentName: string | null, currentPhone: string) => {
    setEditingRecipientId(recipientId);
    setEditDisplayName(currentName ?? "");
    setEditPhoneNumber(currentPhone);
    setSubmitError(null);
  };

  const cancelEditing = () => {
    setEditingRecipientId(null);
    setEditDisplayName("");
    setEditPhoneNumber("");
  };

  const handleSaveEdit = async (recipientId: string) => {
    if (!canUpdate || !editPhoneNumber.trim()) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        recipientId,
        input: {
          displayName: editDisplayName.trim() || null,
          phoneNumber: editPhoneNumber.trim(),
        },
      });
      cancelEditing();
      onSaved("Destinatario actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Elegí destinatarios entre los usuarios de la empresa. El teléfono se toma del perfil del
        usuario (cargalo en Usuarios si falta). No se suscribe automáticamente por rol.
      </Text>

      <Switch
        label="Alertas WhatsApp habilitadas para la compañía"
        description="Debe estar activo junto con el worker del servidor y los templates Twilio."
        checked={settings.adminAlertsEnabled ?? false}
        onChange={(event) => void handleToggleCompanyAlerts(event.currentTarget.checked)}
        disabled={!canUpdate || busy}
      />

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Alertas por asistencia baja
        </Text>
        <Text size="sm" c="dimmed">
          Se notificará cuando un colaborador cruce desde un nivel igual o superior al umbral hacia
          un nivel inferior. Al activar la función se toma el estado actual como referencia y no se
          envían alertas retroactivas.
        </Text>
        <Switch
          label="Habilitar alertas por umbral de asistencia"
          checked={thresholdEnabled}
          onChange={(event) => setThresholdEnabled(event.currentTarget.checked)}
          disabled={!canUpdate || busy || !(settings.adminAlertsEnabled ?? false)}
        />
        <Group grow preventGrowOverflow={false} wrap="wrap">
          <NumberInput
            label="Umbral (%)"
            min={1}
            max={100}
            value={thresholdPercent}
            onChange={(value) =>
              setThresholdPercent(typeof value === "number" ? value : Number(value) || 80)
            }
            disabled={!canUpdate || busy}
          />
          <NumberInput
            label="Período (días)"
            min={7}
            max={365}
            value={windowDays}
            onChange={(value) =>
              setWindowDays(typeof value === "number" ? value : Number(value) || 30)
            }
            disabled={!canUpdate || busy}
          />
          <NumberInput
            label="Mínimo de jornadas"
            min={1}
            max={100}
            value={minimumWorkdays}
            onChange={(value) =>
              setMinimumWorkdays(typeof value === "number" ? value : Number(value) || 5)
            }
            disabled={!canUpdate || busy}
          />
          <NumberInput
            label="Cooldown (días)"
            min={1}
            max={90}
            value={cooldownDays}
            onChange={(value) =>
              setCooldownDays(typeof value === "number" ? value : Number(value) || 7)
            }
            disabled={!canUpdate || busy}
          />
        </Group>
        {canUpdate ? (
          <Button
            variant="light"
            onClick={() => void handleSaveThresholdSettings()}
            disabled={busy || !(settings.adminAlertsEnabled ?? false)}
            style={{ alignSelf: "flex-start" }}
          >
            Guardar umbral de asistencia
          </Button>
        ) : null}
      </Stack>

      {canUpdate ? (
        <Stack gap="xs">
          <Group align="flex-end" wrap="wrap">
            <Select
              label="Usuario de la empresa"
              placeholder={
                usersQuery.isLoading ? "Cargando usuarios…" : "Buscar por nombre o email"
              }
              searchable
              clearable
              data={userSelectData}
              value={selectedUserId}
              onChange={(value) => setSelectedUserId(typeof value === "string" ? value : null)}
              disabled={busy || usersQuery.isLoading}
              nothingFoundMessage="No hay usuarios disponibles"
              style={{ flex: 1, minWidth: 260 }}
            />
            <Button
              onClick={() => void handleCreate()}
              disabled={busy || !selectedUserId || !selectedUser?.phoneNumber?.trim()}
            >
              Agregar destinatario
            </Button>
          </Group>
          {selectedUser && !selectedUser.phoneNumber?.trim() ? (
            <Text size="sm" c="orange">
              Este usuario no tiene teléfono. Editalo en Usuarios de la empresa (formato E.164, ej.
              +5491112345678).
            </Text>
          ) : null}
          {selectedUser?.phoneNumber ? (
            <Text size="sm" c="dimmed">
              Se enviarán alertas a {selectedUser.phoneNumber}.
            </Text>
          ) : null}
        </Stack>
      ) : null}

      {recipientsQuery.isLoading ? (
        <Text size="sm" c="dimmed">
          Cargando destinatarios…
        </Text>
      ) : null}

      {recipientsQuery.data && recipientsQuery.data.length === 0 ? (
        <Text size="sm" c="dimmed">
          No hay destinatarios configurados.
        </Text>
      ) : null}

      {recipientsQuery.data && recipientsQuery.data.length > 0 ? (
        <ScrollArea type="scroll" offsetScrollbars>
          <Table striped highlightOnHover miw={720}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Teléfono</Table.Th>
                <Table.Th>Activo</Table.Th>
                <Table.Th>Operativas</Table.Th>
                <Table.Th>Solicitudes</Table.Th>
                <Table.Th>Seguridad</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {recipientsQuery.data.map((recipient) => {
                const isEditing = editingRecipientId === recipient.id;
                const linkedToUser = Boolean(recipient.userId);
                return (
                  <Table.Tr key={recipient.id}>
                    <Table.Td>
                      {isEditing && !linkedToUser ? (
                        <TextInput
                          value={editDisplayName}
                          onChange={(event) => setEditDisplayName(event.currentTarget.value)}
                          disabled={busy}
                          aria-label="Editar nombre"
                        />
                      ) : (
                        recipient.displayName ?? "—"
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isEditing && !linkedToUser ? (
                        <TextInput
                          value={editPhoneNumber}
                          onChange={(event) => setEditPhoneNumber(event.currentTarget.value)}
                          disabled={busy}
                          aria-label="Editar teléfono"
                        />
                      ) : (
                        recipient.phoneNumber
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        checked={recipient.isEnabled}
                        onChange={(event) =>
                          void handleToggleRecipient(recipient.id, event.currentTarget.checked)
                        }
                        disabled={!canUpdate || busy}
                        aria-label={`Activo ${recipient.displayName ?? recipient.phoneNumber}`}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        checked={recipient.receiveOperationalAlerts}
                        onChange={(event) =>
                          void handleToggleCategory(
                            recipient.id,
                            "receiveOperationalAlerts",
                            event.currentTarget.checked,
                          )
                        }
                        disabled={!canUpdate || busy}
                        aria-label="Operativas"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        checked={recipient.receiveRequestAlerts}
                        onChange={(event) =>
                          void handleToggleCategory(
                            recipient.id,
                            "receiveRequestAlerts",
                            event.currentTarget.checked,
                          )
                        }
                        disabled={!canUpdate || busy}
                        aria-label="Solicitudes"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Switch
                        checked={recipient.receiveSecurityAlerts}
                        onChange={(event) =>
                          void handleToggleCategory(
                            recipient.id,
                            "receiveSecurityAlerts",
                            event.currentTarget.checked,
                          )
                        }
                        disabled={!canUpdate || busy}
                        aria-label="Seguridad"
                      />
                    </Table.Td>
                    <Table.Td>
                      {canUpdate ? (
                        isEditing ? (
                          <Group gap="xs">
                            <Button
                              variant="light"
                              size="compact-sm"
                              onClick={() => void handleSaveEdit(recipient.id)}
                              disabled={busy || !editPhoneNumber.trim()}
                            >
                              Guardar
                            </Button>
                            <Button
                              variant="subtle"
                              size="compact-sm"
                              onClick={cancelEditing}
                              disabled={busy}
                            >
                              Cancelar
                            </Button>
                          </Group>
                        ) : (
                          <Group gap="xs">
                            {!linkedToUser ? (
                              <Button
                                variant="subtle"
                                size="compact-sm"
                                onClick={() =>
                                  startEditing(
                                    recipient.id,
                                    recipient.displayName,
                                    recipient.phoneNumber,
                                  )
                                }
                                disabled={busy}
                              >
                                Editar
                              </Button>
                            ) : null}
                            <Button
                              variant="subtle"
                              color="red"
                              size="compact-sm"
                              onClick={() => void handleDelete(recipient.id)}
                              disabled={busy}
                            >
                              Desactivar
                            </Button>
                          </Group>
                        )
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : null}

      <FormErrorAlert message={submitError} />
    </Stack>
  );
}
