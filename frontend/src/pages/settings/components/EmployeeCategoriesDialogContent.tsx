import { Alert, Button, Group, Stack, Switch, Table, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert } from "../../../design-system";
import {
  useCreateEmployeeCategory,
  useUpdateEmployeeCategory,
} from "../../../hooks/useEmployeeCategories";
import type { EmployeeCategory } from "../../../types/employee-category";
import { getApiErrorMessage } from "../../../utils/errors";

interface EmployeeCategoriesDialogContentProps {
  categories: EmployeeCategory[];
  canUpdate: boolean;
}

export function EmployeeCategoriesDialogContent({
  categories,
  canUpdate,
}: EmployeeCategoriesDialogContentProps) {
  const createMutation = useCreateEmployeeCategory();
  const updateMutation = useUpdateEmployeeCategory();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<EmployeeCategory | null>(null);

  const systemCategories = useMemo(
    () => categories.filter((category) => category.isSystem).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [categories],
  );
  const customCategories = useMemo(
    () =>
      categories
        .filter((category) => !category.isSystem)
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    [categories],
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
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleSaveEdit = async (categoryId: string) => {
    if (!canUpdate || !editingName.trim()) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        categoryId,
        input: { name: editingName.trim() },
      });
      setEditingId(null);
      setEditingName("");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const applyActiveChange = async (categoryId: string, isActive: boolean) => {
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        categoryId,
        input: { isActive },
      });
      setPendingDeactivate(null);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleToggleActive = (category: EmployeeCategory, nextActive: boolean) => {
    if (!canUpdate || category.isSystem) {
      return;
    }

    if (!nextActive) {
      setPendingDeactivate(category);
      return;
    }

    void applyActiveChange(category.id, true);
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Las categorías base están disponibles para todas las empresas. Podés crear categorías propias
        de esta empresa.
      </Text>

      <FormErrorAlert message={submitError} />

      {pendingDeactivate ? (
        <Alert color="yellow" title="Desactivar categoría">
          <Stack gap="sm">
            <Text size="sm">
              Esta categoría está asignada a {pendingDeactivate.assignedEmployeesCount ?? 0}{" "}
              colaborador{(pendingDeactivate.assignedEmployeesCount ?? 0) === 1 ? "" : "es"}.
              Los colaboradores conservarán la categoría, pero no podrá asignarse a nuevos registros.
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
        <Group align="flex-end">
          <TextInput
            label="Nueva categoría"
            placeholder="Ej. Auditor"
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

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Categorías base
        </Text>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Colaboradores</Table.Th>
              <Table.Th>Estado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {systemCategories.map((category) => (
              <Table.Tr key={category.id}>
                <Table.Td>{category.name}</Table.Td>
                <Table.Td>{category.assignedEmployeesCount ?? 0}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    Solo lectura
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>

      <Stack gap="xs">
        <Text fw={600} size="sm">
          Categorías personalizadas
        </Text>
        {customCategories.length === 0 ? (
          <Text size="sm" c="dimmed">
            Todavía no hay categorías personalizadas.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Colaboradores</Table.Th>
                <Table.Th>Activo</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {customCategories.map((category) => (
                <Table.Tr key={category.id}>
                  <Table.Td>
                    {editingId === category.id ? (
                      <TextInput
                        value={editingName}
                        onChange={(event) => setEditingName(event.currentTarget.value)}
                        disabled={disabled}
                      />
                    ) : (
                      category.name
                    )}
                  </Table.Td>
                  <Table.Td>{category.assignedEmployeesCount ?? 0}</Table.Td>
                  <Table.Td>
                    <Switch
                      checked={category.isActive}
                      disabled={disabled}
                      onChange={(event) =>
                        handleToggleActive(category, event.currentTarget.checked)
                      }
                      aria-label={`Activar ${category.name}`}
                    />
                  </Table.Td>
                  <Table.Td>
                    {editingId === category.id ? (
                      <Group gap="xs">
                        <Button
                          size="xs"
                          disabled={disabled || !editingName.trim()}
                          onClick={() => void handleSaveEdit(category.id)}
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
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                      >
                        Editar
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Stack>
  );
}
