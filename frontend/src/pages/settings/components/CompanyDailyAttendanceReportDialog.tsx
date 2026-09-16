/**
 * @deprecated Prefer CompanyWhatsAppAlertsDialog — daily report settings and
 * audience share the same alert recipients. Kept for reference until Phase 2
 * cutover removes the report-email-recipients API path.
 */
import {
  Alert,
  Button,
  Group,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { FormGrid, ResponsiveModal } from "../../../design-system";
import { useUpdateCompanySettings } from "../../../hooks/useCompanySettings";
import {
  useCompanyReportEmailRecipients,
  useCreateCompanyReportEmailRecipient,
  useDeleteCompanyReportEmailRecipient,
  useUpdateCompanyReportEmailRecipient,
} from "../../../hooks/useCompanyReportEmailRecipients";
import type { CompanySettings } from "../../../types/company-settings";
import { getApiErrorMessage } from "../../../utils/errors";
import { SettingsFormField } from "./SettingsFormField";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface CompanyDailyAttendanceReportDialogProps {
  opened: boolean;
  onClose: () => void;
  settings: CompanySettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyDailyAttendanceReportDialog({
  opened,
  onClose,
  settings,
  canUpdate,
  onSaved,
}: CompanyDailyAttendanceReportDialogProps) {
  const updateSettings = useUpdateCompanySettings();
  const recipientsQuery = useCompanyReportEmailRecipients(true);
  const createMutation = useCreateCompanyReportEmailRecipient();
  const updateMutation = useUpdateCompanyReportEmailRecipient();
  const deleteMutation = useDeleteCompanyReportEmailRecipient();

  const [enabled, setEnabled] = useState(settings.dailyAttendanceReportEnabled ?? false);
  const [reportTime, setReportTime] = useState(
    settings.dailyAttendanceReportTime?.slice(0, 5) ?? "08:00",
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");

  const busy =
    updateSettings.isPending ||
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const timeError = useMemo(() => {
    if (!HHMM_RE.test(reportTime.trim())) {
      return "Usá el formato HH:mm (00:00–23:59).";
    }
    return null;
  }, [reportTime]);

  const settingsDirty =
    enabled !== (settings.dailyAttendanceReportEnabled ?? false) ||
    reportTime.trim() !== (settings.dailyAttendanceReportTime?.slice(0, 5) ?? "08:00");

  const handleSaveSettings = async () => {
    if (!canUpdate || timeError || !settingsDirty) {
      return;
    }
    setSubmitError(null);
    try {
      await updateSettings.mutateAsync({
        dailyAttendanceReportEnabled: enabled,
        dailyAttendanceReportTime: reportTime.trim(),
      });
      onSaved("Reporte diario de asistencia actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleCreate = async () => {
    if (!canUpdate || !newEmail.trim()) {
      return;
    }
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        email: newEmail.trim(),
        displayName: newDisplayName.trim() || null,
        isEnabled: true,
      });
      setNewEmail("");
      setNewDisplayName("");
      onSaved("Destinatario de email agregado.");
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
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleDelete = async (recipientId: string) => {
    if (!canUpdate) {
      return;
    }
    const confirmed = window.confirm("¿Eliminar este destinatario de email?");
    if (!confirmed) {
      return;
    }
    setSubmitError(null);
    try {
      await deleteMutation.mutateAsync(recipientId);
      onSaved("Destinatario eliminado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const startEditing = (recipientId: string, email: string, displayName: string | null) => {
    setEditingRecipientId(recipientId);
    setEditEmail(email);
    setEditDisplayName(displayName ?? "");
  };

  const cancelEditing = () => {
    setEditingRecipientId(null);
    setEditEmail("");
    setEditDisplayName("");
  };

  const handleSaveEdit = async (recipientId: string) => {
    if (!canUpdate || !editEmail.trim()) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        recipientId,
        input: {
          email: editEmail.trim(),
          displayName: editDisplayName.trim() || null,
        },
      });
      cancelEditing();
      onSaved("Destinatario actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Reporte diario de asistencia por email"
      size="xl"
      bodyMode="scroll"
      footer={
        <Group justify="flex-end" gap="sm">
          <Button variant="default" size="md" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          {canUpdate ? (
            <Button
              size="md"
              onClick={() => void handleSaveSettings()}
              loading={updateSettings.isPending}
              disabled={!settingsDirty || Boolean(timeError) || busy}
            >
              Guardar configuración
            </Button>
          ) : null}
        </Group>
      }
    >
      <Stack gap="md">
        <Alert color="blue">
          Resume las jornadas del día anterior (D-1) en la zona horaria de la empresa. No reemplaza
          las alertas WhatsApp urgentes; ambas pueden convivir.
        </Alert>

        <Switch
          label="Reporte diario por email habilitado"
          description="Deshabilitado por defecto. Activá solo en empresas piloto con SMTP y destinatarios."
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
          disabled={!canUpdate || busy}
        />

        <FormGrid>
          <SettingsFormField
            label="Horario local de envío (HH:mm)"
            description={timeError ?? "Hora civil de la empresa, no UTC."}
          >
            <TextInput
              value={reportTime}
              onChange={(event) => setReportTime(event.currentTarget.value)}
              placeholder="08:00"
              disabled={!canUpdate || busy}
              error={timeError}
              aria-label="Horario local del reporte diario"
            />
          </SettingsFormField>
          <SettingsFormField
            label="Zona horaria de la empresa"
            description="Se reutiliza operation_timezone. El horario anterior es hora local, no UTC."
          >
            <Text size="sm">{settings.operationTimezone}</Text>
          </SettingsFormField>
        </FormGrid>

        <Stack gap="xs">
          <Title order={5}>Destinatarios de email</Title>
          <Text size="sm" c="dimmed">
            Lista explícita, separada de los teléfonos de alertas WhatsApp. No se infieren desde
            usuarios automáticamente.
          </Text>

          {canUpdate ? (
            <Group align="flex-end" grow preventGrowOverflow={false} wrap="wrap">
              <TextInput
                label="Email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.currentTarget.value)}
                placeholder="admin@empresa.com"
                disabled={busy}
              />
              <TextInput
                label="Nombre (opcional)"
                value={newDisplayName}
                onChange={(event) => setNewDisplayName(event.currentTarget.value)}
                disabled={busy}
              />
              <Button onClick={() => void handleCreate()} loading={createMutation.isPending}>
                Agregar
              </Button>
            </Group>
          ) : null}

          {recipientsQuery.isLoading ? <Text size="sm">Cargando destinatarios…</Text> : null}
          {recipientsQuery.isError ? (
            <Alert color="red">{getApiErrorMessage(recipientsQuery.error)}</Alert>
          ) : null}
          {recipientsQuery.data && recipientsQuery.data.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hay destinatarios configurados.
            </Text>
          ) : null}

          {recipientsQuery.data && recipientsQuery.data.length > 0 ? (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nombre</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Activo</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recipientsQuery.data.map((recipient) => {
                  const isEditing = editingRecipientId === recipient.id;
                  return (
                    <Table.Tr key={recipient.id}>
                      <Table.Td>
                        {isEditing ? (
                          <TextInput
                            value={editDisplayName}
                            onChange={(event) => setEditDisplayName(event.currentTarget.value)}
                            disabled={busy}
                          />
                        ) : (
                          recipient.displayName ?? "—"
                        )}
                      </Table.Td>
                      <Table.Td>
                        {isEditing ? (
                          <TextInput
                            value={editEmail}
                            onChange={(event) => setEditEmail(event.currentTarget.value)}
                            disabled={busy}
                          />
                        ) : (
                          recipient.email
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={recipient.isEnabled}
                          onChange={(event) =>
                            void handleToggleRecipient(recipient.id, event.currentTarget.checked)
                          }
                          disabled={!canUpdate || busy}
                          aria-label={`Activo ${recipient.email}`}
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
                                disabled={busy || !editEmail.trim()}
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
                              <Button
                                variant="subtle"
                                size="compact-sm"
                                onClick={() =>
                                  startEditing(
                                    recipient.id,
                                    recipient.email,
                                    recipient.displayName,
                                  )
                                }
                                disabled={busy}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="subtle"
                                color="red"
                                size="compact-sm"
                                onClick={() => void handleDelete(recipient.id)}
                                disabled={busy}
                              >
                                Eliminar
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
          ) : null}
        </Stack>

        {submitError ? <Alert color="red">{submitError}</Alert> : null}
      </Stack>
    </ResponsiveModal>
  );
}
