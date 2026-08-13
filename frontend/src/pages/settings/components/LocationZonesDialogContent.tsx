import { Alert, Button, Group, ScrollArea, Stack, Switch, Table, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert } from "../../../design-system";
import { useCreateLocationZone, useUpdateLocationZone } from "../../../hooks/useLocationZones";
import type { LocationZone } from "../../../types/location-zone";
import { getApiErrorMessage } from "../../../utils/errors";

interface LocationZonesDialogContentProps {
  zones: LocationZone[];
  canUpdate: boolean;
}

export function LocationZonesDialogContent({ zones, canUpdate }: LocationZonesDialogContentProps) {
  const createMutation = useCreateLocationZone();
  const updateMutation = useUpdateLocationZone();

  const [newName, setNewName] = useState("");
  const [newLocality, setNewLocality] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingLocality, setEditingLocality] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<LocationZone | null>(null);

  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [zones],
  );

  const disabled = !canUpdate || createMutation.isPending || updateMutation.isPending;

  const handleCreate = async () => {
    if (!canUpdate || !newName.trim()) {
      return;
    }

    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        name: newName.trim(),
        locality: newLocality.trim() ? newLocality.trim() : null,
      });
      setNewName("");
      setNewLocality("");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleSaveEdit = async (zoneId: string) => {
    if (!canUpdate || !editingName.trim()) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        zoneId,
        input: {
          name: editingName.trim(),
          locality: editingLocality.trim() ? editingLocality.trim() : null,
        },
      });
      setEditingId(null);
      setEditingName("");
      setEditingLocality("");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const applyActiveChange = async (zoneId: string, isActive: boolean) => {
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        zoneId,
        input: { isActive },
      });
      setPendingDeactivate(null);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleToggleActive = (zone: LocationZone, nextActive: boolean) => {
    if (!canUpdate) {
      return;
    }

    if (!nextActive) {
      setPendingDeactivate(zone);
      return;
    }

    void applyActiveChange(zone.id, true);
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Catálogo de zonas aproximadas de residencia para colaboradores. No se almacenan direcciones
        exactas.
      </Text>

      <FormErrorAlert message={submitError} />

      {pendingDeactivate ? (
        <Alert color="yellow" title="Desactivar zona">
          <Stack gap="sm">
            <Text size="sm">
              Esta zona está asignada a {pendingDeactivate.assignedEmployeesCount ?? 0}{" "}
              colaborador{(pendingDeactivate.assignedEmployeesCount ?? 0) === 1 ? "" : "es"}.
              Los colaboradores conservarán la zona, pero no podrá asignarse a nuevos registros.
            </Text>
            <Group gap="xs">
              <Button
                color="red"
                size="xs"
                loading={updateMutation.isPending}
                onClick={() => void applyActiveChange(pendingDeactivate.id, false)}
              >
                Desactivar
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={updateMutation.isPending}
                onClick={() => setPendingDeactivate(null)}
              >
                Cancelar
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}

      {canUpdate ? (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Nueva zona
          </Text>
          <Group align="flex-end" grow>
            <TextInput
              label="Nombre"
              placeholder="Ej. Caballito"
              value={newName}
              onChange={(event) => setNewName(event.currentTarget.value)}
              disabled={disabled}
            />
            <TextInput
              label="Localidad"
              placeholder="Ej. Ciudad Autónoma de Buenos Aires"
              value={newLocality}
              onChange={(event) => setNewLocality(event.currentTarget.value)}
              disabled={disabled}
            />
            <Button onClick={() => void handleCreate()} loading={createMutation.isPending} disabled={disabled}>
              Agregar
            </Button>
          </Group>
        </Stack>
      ) : null}

      <ScrollArea.Autosize mah={360}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Localidad</Table.Th>
              <Table.Th>Asignados</Table.Th>
              <Table.Th>Activa</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedZones.map((zone) => {
              const isEditing = editingId === zone.id;
              return (
                <Table.Tr key={zone.id}>
                  <Table.Td>
                    {isEditing ? (
                      <TextInput
                        value={editingName}
                        onChange={(event) => setEditingName(event.currentTarget.value)}
                        disabled={disabled}
                      />
                    ) : (
                      zone.name
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isEditing ? (
                      <TextInput
                        value={editingLocality}
                        onChange={(event) => setEditingLocality(event.currentTarget.value)}
                        disabled={disabled}
                      />
                    ) : (
                      zone.locality ?? "—"
                    )}
                  </Table.Td>
                  <Table.Td>{zone.assignedEmployeesCount ?? 0}</Table.Td>
                  <Table.Td>
                    <Switch
                      checked={zone.isActive}
                      disabled={disabled}
                      onChange={(event) =>
                        handleToggleActive(zone, event.currentTarget.checked)
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    {canUpdate ? (
                      isEditing ? (
                        <Group gap="xs">
                          <Button
                            size="xs"
                            onClick={() => void handleSaveEdit(zone.id)}
                            loading={updateMutation.isPending}
                          >
                            Guardar
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            disabled={disabled}
                            onClick={() => {
                              setEditingId(null);
                              setEditingName("");
                              setEditingLocality("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </Group>
                      ) : (
                        <Button
                          size="xs"
                          variant="light"
                          disabled={disabled}
                          onClick={() => {
                            setEditingId(zone.id);
                            setEditingName(zone.name);
                            setEditingLocality(zone.locality ?? "");
                          }}
                        >
                          Editar
                        </Button>
                      )
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Stack>
  );
}
