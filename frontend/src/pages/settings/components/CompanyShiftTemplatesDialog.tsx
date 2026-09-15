import {
  Alert,
  Badge,
  Button,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert, ResponsiveModal } from "../../../design-system";
import {
  useCreateShiftTemplate,
  useDeactivateShiftTemplate,
  useShiftTemplates,
  useUpdateShiftTemplate,
} from "../../../hooks/useShiftTemplates";
import type { CompanyShiftTemplate } from "../../../types/operation-shift";
import { getApiErrorMessage } from "../../../utils/errors";
import { isOvernightShift } from "../../../utils/operation-shift-payload";
import { OperationTimeInput } from "./OperationTimeInput";

interface CompanyShiftTemplatesDialogProps {
  opened: boolean;
  onClose: () => void;
  canUpdate: boolean;
}

type TemplateFormState = {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
};

const emptyForm = (): TemplateFormState => ({
  code: "",
  name: "",
  startTime: "08:00",
  endTime: "16:00",
});

function formatTimeRange(startTime: string, endTime: string): string {
  const overnight = isOvernightShift(startTime, endTime);
  return overnight ? `${startTime} → ${endTime} (nocturno)` : `${startTime} – ${endTime}`;
}

export function CompanyShiftTemplatesDialog({
  opened,
  onClose,
  canUpdate,
}: CompanyShiftTemplatesDialogProps) {
  const templatesQuery = useShiftTemplates({}, opened);
  const createMutation = useCreateShiftTemplate();
  const updateMutation = useUpdateShiftTemplate();
  const deactivateMutation = useDeactivateShiftTemplate();

  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<CompanyShiftTemplate | null>(null);

  const templates = useMemo(
    () =>
      [...(templatesQuery.data ?? [])].sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"),
      ),
    [templatesQuery.data],
  );

  const busy =
    createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;
  const disabled = !canUpdate || busy;
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const startEdit = (template: CompanyShiftTemplate) => {
    setEditingId(template.id);
    setForm({
      code: template.code,
      name: template.name,
      startTime: template.startTime,
      endTime: template.endTime,
    });
    setSubmitError(null);
    setPendingDeactivate(null);
  };

  const handleSubmit = async () => {
    if (!canUpdate || !form.name.trim() || !form.startTime || !form.endTime) {
      return;
    }

    setSubmitError(null);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          templateId: editingId,
          input: {
            name: form.name.trim(),
            startTime: form.startTime,
            endTime: form.endTime,
          },
        });
      } else {
        await createMutation.mutateAsync({
          ...(form.code.trim() ? { code: form.code.trim() } : {}),
          name: form.name.trim(),
          startTime: form.startTime,
          endTime: form.endTime,
        });
      }
      resetForm();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleDeactivate = async (templateId: string) => {
    setSubmitError(null);
    try {
      await deactivateMutation.mutateAsync(templateId);
      setPendingDeactivate(null);
      if (editingId === templateId) {
        resetForm();
      }
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleReactivate = async (templateId: string) => {
    setSubmitError(null);
    setReactivatingId(templateId);
    try {
      await updateMutation.mutateAsync({
        templateId,
        input: { isActive: true },
      });
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setReactivatingId(null);
    }
  };

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Plantillas de turnos"
      size="lg"
      bodyMode="scroll"
      footer={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Definí turnos reutilizables (código, nombre y horario). Editar una plantilla no
          reescribe turnos históricos ya creados en operaciones.
        </Text>

        {!canUpdate ? (
          <Alert color="blue">No tenés permisos para gestionar plantillas de turnos.</Alert>
        ) : null}

        <FormErrorAlert message={submitError} />

        {templatesQuery.isError ? (
          <Alert color="red" title="No se pudieron cargar las plantillas">
            <Stack gap="sm">
              <Text size="sm">{getApiErrorMessage(templatesQuery.error)}</Text>
              <Button size="xs" variant="light" onClick={() => void templatesQuery.refetch()}>
                Reintentar
              </Button>
            </Stack>
          </Alert>
        ) : null}

        {pendingDeactivate ? (
          <Alert color="yellow" title="Desactivar plantilla">
            <Stack gap="sm">
              <Text size="sm">
                ¿Desactivás “{pendingDeactivate.name}”? Dejará de estar disponible para nuevas
                operaciones; los turnos ya creados no se modifican.
              </Text>
              <Group gap="xs">
                <Button
                  color="red"
                  size="xs"
                  loading={deactivateMutation.isPending}
                  onClick={() => void handleDeactivate(pendingDeactivate.id)}
                >
                  Desactivar
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  disabled={deactivateMutation.isPending}
                  onClick={() => setPendingDeactivate(null)}
                >
                  Cancelar
                </Button>
              </Group>
            </Stack>
          </Alert>
        ) : null}

        {canUpdate ? (
          <Stack gap="sm">
            <Text fw={600} size="sm">
              {editingId ? "Editar plantilla" : "Nueva plantilla"}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Código"
                placeholder="Ej. MANANA"
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.currentTarget.value }))
                }
                disabled={disabled || Boolean(editingId)}
                description={editingId ? "El código no se puede cambiar." : "Opcional."}
              />
              <TextInput
                label="Nombre"
                placeholder="Ej. Turno mañana"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.currentTarget.value }))
                }
                disabled={disabled}
                required
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Inicio
                </Text>
                <OperationTimeInput
                  value={form.startTime}
                  onChange={(startTime) => setForm((current) => ({ ...current, startTime }))}
                  disabled={disabled}
                  aria-label="Hora de inicio"
                />
              </Stack>
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Fin
                </Text>
                <OperationTimeInput
                  value={form.endTime}
                  onChange={(endTime) => setForm((current) => ({ ...current, endTime }))}
                  disabled={disabled}
                  aria-label="Hora de fin"
                />
              </Stack>
            </SimpleGrid>
            {isOvernightShift(form.startTime, form.endTime) ? (
              <Badge color="violet" variant="light" w="fit-content">
                Turno nocturno (cruza medianoche)
              </Badge>
            ) : null}
            <Group gap="xs">
              <Button
                onClick={() => void handleSubmit()}
                disabled={disabled || !form.name.trim()}
                loading={createMutation.isPending || updateMutation.isPending}
              >
                {editingId ? "Guardar cambios" : "Agregar plantilla"}
              </Button>
              {editingId ? (
                <Button variant="default" disabled={busy} onClick={resetForm}>
                  Cancelar edición
                </Button>
              ) : null}
            </Group>
          </Stack>
        ) : null}

        <Stack gap="xs">
          <Text fw={600} size="sm">
            Plantillas
          </Text>
          {templatesQuery.isPending ? (
            <Text size="sm" c="dimmed">
              Cargando plantillas…
            </Text>
          ) : templates.length === 0 ? (
            <Text size="sm" c="dimmed">
              Todavía no hay plantillas de turnos. Creá la primera para usarlas en operaciones
              multi-turno.
            </Text>
          ) : (
            <ScrollArea type="scroll" offsetScrollbars>
              <Table striped highlightOnHover miw={560}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nombre</Table.Th>
                    <Table.Th>Código</Table.Th>
                    <Table.Th>Horario</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {templates.map((template) => (
                    <Table.Tr key={template.id}>
                      <Table.Td>{template.name}</Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace">
                          {template.code}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6}>
                          <Text size="sm">
                            {formatTimeRange(template.startTime, template.endTime)}
                          </Text>
                          {isOvernightShift(template.startTime, template.endTime) ? (
                            <Badge size="xs" color="violet" variant="light">
                              Nocturno
                            </Badge>
                          ) : null}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={template.isActive ? "green" : "gray"}
                          variant="light"
                        >
                          {template.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {canUpdate ? (
                          template.isActive ? (
                            <Group gap={6}>
                              <Button
                                size="compact-xs"
                                variant="light"
                                disabled={busy}
                                onClick={() => startEdit(template)}
                              >
                                Editar
                              </Button>
                              <Button
                                size="compact-xs"
                                color="red"
                                variant="light"
                                disabled={busy}
                                onClick={() => setPendingDeactivate(template)}
                              >
                                Desactivar
                              </Button>
                            </Group>
                          ) : (
                            <Button
                              size="compact-xs"
                              variant="light"
                              disabled={busy}
                              loading={reactivatingId === template.id}
                              onClick={() => void handleReactivate(template.id)}
                            >
                              Reactivar
                            </Button>
                          )
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Stack>
    </ResponsiveModal>
  );
}
