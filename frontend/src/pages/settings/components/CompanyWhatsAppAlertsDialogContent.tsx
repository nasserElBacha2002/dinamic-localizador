import {
  Button,
  Group,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { FormErrorAlert } from "../../../design-system";
import {
  useCompanyAlertRecipients,
  useCreateCompanyAlertRecipient,
  useDeleteCompanyAlertRecipient,
  useUpdateCompanyAlertRecipient,
} from "../../../hooks/useCompanyAlertRecipients";
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
  const recipientsQuery = useCompanyAlertRecipients(true);
  const createMutation = useCreateCompanyAlertRecipient();
  const updateMutation = useUpdateCompanyAlertRecipient();
  const deleteMutation = useDeleteCompanyAlertRecipient();
  const updateSettings = useUpdateCompanySettings();

  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    updateSettings.isPending;

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

  const handleCreate = async () => {
    if (!canUpdate || !phoneNumber.trim()) {
      return;
    }
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        displayName: displayName.trim() || null,
        phoneNumber: phoneNumber.trim(),
      });
      setDisplayName("");
      setPhoneNumber("");
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

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Configurá destinatarios explícitos para alertas WhatsApp operativas y de seguridad. No se
        suscribe automáticamente por rol.
      </Text>

      <Switch
        label="Alertas WhatsApp habilitadas para la compañía"
        description="Debe estar activo junto con el worker del servidor y los templates Twilio."
        checked={settings.adminAlertsEnabled ?? false}
        onChange={(event) => void handleToggleCompanyAlerts(event.currentTarget.checked)}
        disabled={!canUpdate || busy}
      />

      {canUpdate ? (
        <Group align="flex-end" wrap="wrap">
          <TextInput
            label="Nombre"
            placeholder="Ej. Responsable operaciones"
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            disabled={busy}
            style={{ flex: 1, minWidth: 180 }}
          />
          <TextInput
            label="Teléfono (E.164)"
            placeholder="+5491112345678"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.currentTarget.value)}
            disabled={busy}
            style={{ flex: 1, minWidth: 180 }}
          />
          <Button onClick={() => void handleCreate()} disabled={busy || !phoneNumber.trim()}>
            Agregar destinatario
          </Button>
        </Group>
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
              {recipientsQuery.data.map((recipient) => (
                <Table.Tr key={recipient.id}>
                  <Table.Td>{recipient.displayName ?? "—"}</Table.Td>
                  <Table.Td>{recipient.phoneNumber}</Table.Td>
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
                      <Button
                        variant="subtle"
                        color="red"
                        size="compact-sm"
                        onClick={() => void handleDelete(recipient.id)}
                        disabled={busy}
                      >
                        Desactivar
                      </Button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : null}

      <FormErrorAlert message={submitError} />
    </Stack>
  );
}
