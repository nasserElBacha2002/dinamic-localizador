import { Badge, Button, Group, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import type { Employee } from "../../types/employee";
import type { OperationKind } from "../../types/operation";
import { terminology } from "../../domain/terminology";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import { employeeTypeLabels } from "../../utils/labels";
import {
  getRecurringValidityErrors,
  hasRecurringValidityErrors,
} from "../../utils/work-team-assignment-ui";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";

export interface AssignEmployeesResult {
  status: "success" | "partial" | "error";
  added: string[];
  skipped: Array<{ employeeId: string; reason: string }>;
}

export interface OperationIndividualAssignmentPanelProps {
  operationKind: OperationKind;
  operationWorkDate: string;
  excludeEmployeeIds: string[];
  loading?: boolean;
  onAssign: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<AssignEmployeesResult>;
  onResult?: (result: AssignEmployeesResult) => void;
}

export function OperationIndividualAssignmentPanel({
  operationKind,
  operationWorkDate,
  excludeEmployeeIds,
  loading = false,
  onAssign,
  onResult,
}: OperationIndividualAssignmentPanelProps) {
  const isRecurring = operationKind === "RECURRING";
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<AssignEmployeesResult["skipped"]>([]);

  const excludeIds = useMemo(
    () => [...new Set([...excludeEmployeeIds, ...selectedEmployees.map((employee) => employee.id)])],
    [excludeEmployeeIds, selectedEmployees],
  );

  const employeeNameById = useMemo(
    () => new Map(selectedEmployees.map((employee) => [employee.id, employee.name])),
    [selectedEmployees],
  );

  const validityErrors = useMemo(
    () => (isRecurring ? getRecurringValidityErrors(validFrom, validUntil) : { validFrom: null, validUntil: null }),
    [isRecurring, validFrom, validUntil],
  );
  const hasValidityErrors = hasRecurringValidityErrors(validityErrors);

  // State is reset by remounting via a `key` in the parent dialog whenever the
  // operation (kind/date) changes, so no reset effect is needed here.

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

    if (isRecurring && hasValidityErrors) {
      setErrorMessage("Revisá las fechas de vigencia antes de asignar.");
      return;
    }

    setErrorMessage(null);
    setSkipped([]);
    try {
      const result = await onAssign({
        employeeIds: selectedEmployees.map((employee) => employee.id),
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });

      const addedIds = new Set(result.added);
      // Keep only the collaborators that failed so the operator can retry them.
      setSelectedEmployees((current) => current.filter((employee) => !addedIds.has(employee.id)));
      setSkipped(result.skipped);
      onResult?.(result);
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
            error={validityErrors.validFrom}
            required
          />
          <TextInput
            type="date"
            label="Hasta (opcional)"
            value={validUntil}
            onChange={(event) => setValidUntil(event.currentTarget.value)}
            error={validityErrors.validUntil}
          />
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          La asignación aplicará a la fecha de la operación:{" "}
          {formatDateInputDisplay(operationWorkDate)}.
        </Text>
      )}

      {skipped.length > 0 ? (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            No se pudieron asignar ({skipped.length})
          </Text>
          {skipped.map((entry) => (
            <Group key={entry.employeeId} justify="space-between" wrap="nowrap" gap="xs">
              <Text size="sm">{employeeNameById.get(entry.employeeId) ?? "Colaborador"}</Text>
              <Badge variant="light" color="red">
                {entry.reason}
              </Badge>
            </Group>
          ))}
        </Stack>
      ) : null}

      <Group justify="flex-end">
        <Button
          onClick={() => void handleAssign()}
          loading={loading}
          disabled={selectedEmployees.length === 0 || loading || (isRecurring && hasValidityErrors)}
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
