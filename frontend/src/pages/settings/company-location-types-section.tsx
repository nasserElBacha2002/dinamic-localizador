import { Button, Group, Stack, Switch, Table, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert, SectionCard } from "../../design-system";
import {
  useCompanyLocationTypes,
  useCreateCompanyLocationType,
  useDisableCompanyLocationType,
  useUpdateCompanyLocationType,
} from "../../hooks/useCompanyLocationTypes";
import { getApiErrorMessage } from "../../utils/errors";

interface CompanyLocationTypesSettingsSectionProps {
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyLocationTypesSettingsSection({
  canUpdate,
  onSaved,
}: CompanyLocationTypesSettingsSectionProps) {
  const locationTypesQuery = useCompanyLocationTypes(false);
  const createMutation = useCreateCompanyLocationType();
  const updateMutation = useUpdateCompanyLocationType();
  const disableMutation = useDisableCompanyLocationType();

  const [newName, setNewName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sortedTypes = useMemo(
    () => [...(locationTypesQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [locationTypesQuery.data],
  );

  const disabled = !canUpdate || createMutation.isPending || updateMutation.isPending;

  const handleCreate = async () => {
    if (!canUpdate || !newName.trim()) {
      return;
    }

    setSubmitError(null);
    try {
      await createMutation.mutateAsync({ name: newName.trim() });
      setNewName("");
      onSaved("Tipo de ubicación/servicio creado correctamente.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleToggleActive = async (locationTypeId: string, isActive: boolean) => {
    if (!canUpdate) {
      return;
    }

    setSubmitError(null);
    try {
      if (isActive) {
        await updateMutation.mutateAsync({ locationTypeId, input: { isActive: true } });
      } else {
        await disableMutation.mutateAsync(locationTypeId);
      }
      onSaved("Tipo de ubicación/servicio actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SectionCard
      title="Tipos de ubicación / servicio"
      description="Definí los tipos que pueden asignarse a ubicaciones de la empresa."
    >
      <Stack gap="md">
        {canUpdate ? (
          <Group align="flex-end">
            <TextInput
              label="Nuevo tipo"
              placeholder="Ej. Express"
              value={newName}
              onChange={(event) => setNewName(event.currentTarget.value)}
              disabled={disabled}
              style={{ flex: 1 }}
            />
            <Button onClick={() => void handleCreate()} disabled={disabled || !newName.trim()}>
              Agregar
            </Button>
          </Group>
        ) : null}

        {locationTypesQuery.isLoading ? (
          <Text size="sm">Cargando tipos...</Text>
        ) : sortedTypes.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay tipos configurados.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Orden</Table.Th>
                <Table.Th>Activo</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedTypes.map((type) => (
                <Table.Tr key={type.id}>
                  <Table.Td>{type.name}</Table.Td>
                  <Table.Td>{type.code}</Table.Td>
                  <Table.Td>{type.sortOrder}</Table.Td>
                  <Table.Td>
                    <Switch
                      checked={type.isActive}
                      onChange={(event) =>
                        void handleToggleActive(type.id, event.currentTarget.checked)
                      }
                      disabled={!canUpdate || disableMutation.isPending || updateMutation.isPending}
                      aria-label={`Activo ${type.name}`}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <FormErrorAlert message={submitError} />
      </Stack>
    </SectionCard>
  );
}
