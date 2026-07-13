import { Button, Group, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type { Employee } from "../../types/employee";
import type { OperationKind } from "../../types/operation";
import { terminology } from "../../domain/terminology";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import { employeeTypeLabels } from "../../utils/labels";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";

export interface OperationIndividualAssignmentPanelProps {
  operationKind: OperationKind;
  operationWorkDate: string;
  excludeEmployeeIds: string[];
  loading?: boolean;
  onAssign: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<void>;
}

export function OperationIndividualAssignmentPanel({
  operationKind,
  operationWorkDate,
  excludeEmployeeIds,
  loading = false,
  onAssign,
}: OperationIndividualAssignmentPanelProps) {
  const isRecurring = operationKind === "RECURRING";
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const excludeIds = useMemo(
    () => [...new Set([...excludeEmployeeIds, ...selectedEmployees.map((employee) => employee.id)])],
    [excludeEmployeeIds, selectedEmployees],
  );

  useEffect(() => {
    setSelectedEmployees([]);
    setValidFrom(getTodayDateInput());
    setValidUntil("");
    setErrorMessage(null);
  }, [operationWorkDate, operationKind]);

  const handleEmployeeSelected = (employee: Employee) => {
    if (selectedEmployees.some((item) => item.id === employee.id)) {
      return;
    }
    setSelectedEmployees((current) => [...current, employee]);
  };

  const handleRemove = (employeeId: string) => {
    setSelectedEmployees((current) => current.filter((employee) => employee.id !== employeeId));
  };

  const handleAssign = async () => {
    if (selectedEmployees.length === 0) {
      setErrorMessage("Seleccioná al menos un colaborador.");
      return;
    }

    setErrorMessage(null);
    try {
      await onAssign({
        employeeIds: selectedEmployees.map((employee) => employee.id),
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });
      setSelectedEmployees([]);
      setValidUntil("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo completar la asignación.");
    }
  };

  return (
    <Stack gap="md">
      <EmployeeSearchAutocomplete
        label={`Buscar ${terminology.worker.singular.toLowerCase()} activo`}
        value={null}
        onChange={() => {}}
        onEmployeeSelected={handleEmployeeSelected}
        excludeIds={excludeIds}
        activeOnly
        descriptionMode="assignment"
        placeholder="Nombre o teléfono"
        helperText="Buscá y agregá uno o más colaboradores a la selección."
      />

      {selectedEmployees.length > 0 ? (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Seleccionados ({selectedEmployees.length})
          </Text>
          {selectedEmployees.map((employee) => (
            <Group key={employee.id} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm" fw={500}>
                  {employee.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {employeeTypeLabels[employee.employeeType]}
                </Text>
              </Stack>
              <Button variant="subtle" size="compact-xs" onClick={() => handleRemove(employee.id)}>
                Quitar
              </Button>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          No hay colaboradores seleccionados.
        </Text>
      )}

      {isRecurring ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="md">
          <TextInput
            type="date"
            label="Desde"
            value={validFrom}
            onChange={(event) => setValidFrom(event.currentTarget.value)}
            required
          />
          <TextInput
            type="date"
            label="Hasta (opcional)"
            value={validUntil}
            onChange={(event) => setValidUntil(event.currentTarget.value)}
          />
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          La asignación aplicará a la fecha de la operación:{" "}
          {formatDateInputDisplay(operationWorkDate)}.
        </Text>
      )}

      <Group justify="flex-end">
        <Button
          onClick={() => void handleAssign()}
          loading={loading}
          disabled={selectedEmployees.length === 0 || loading}
        >
          Asignar colaboradores
        </Button>
      </Group>

      {errorMessage ? (
        <Text size="sm" c="red">
          {errorMessage}
        </Text>
      ) : null}
    </Stack>
  );
}
