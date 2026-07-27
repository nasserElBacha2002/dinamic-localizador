import { Badge, Button, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import type { OperationKind } from "../../types/operation";
import { terminology } from "../../domain/terminology";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import {
  getRecurringValidityErrors,
  hasRecurringValidityErrors,
} from "../../utils/work-team-assignment-ui";
import { EmployeeMultiSelect } from "../lookups/EntityMultiSelects";

export interface AssignEmployeesResult {
  status: "success" | "partial" | "error";
  added: string[];
  skipped: Array<{ employeeId: string; code?: string; reason: string; employeeName?: string }>;
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
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<AssignEmployeesResult["skipped"]>([]);

  const excludeIds = useMemo(
    () => [...new Set([...excludeEmployeeIds])],
    [excludeEmployeeIds],
  );

  const validityErrors = useMemo(
    () => (isRecurring ? getRecurringValidityErrors(validFrom, validUntil) : { validFrom: null, validUntil: null }),
    [isRecurring, validFrom, validUntil],
  );
  const hasValidityErrors = hasRecurringValidityErrors(validityErrors);

  const handleAssign = async () => {
    if (selectedEmployeeIds.length === 0) {
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
        employeeIds: selectedEmployeeIds,
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });

      const addedIds = new Set(result.added);
      setSelectedEmployeeIds((current) => current.filter((id) => !addedIds.has(id)));
      setSkipped(result.skipped);
      onResult?.(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo completar la asignación.");
    }
  };

  const assignLabel =
    selectedEmployeeIds.length <= 1
      ? `Asignar ${terminology.worker.singular.toLowerCase()}`
      : `Asignar ${selectedEmployeeIds.length} ${terminology.worker.plural.toLowerCase()}`;

  return (
    <Stack gap="md">
      <EmployeeMultiSelect
        label={`Buscar ${terminology.worker.plural.toLowerCase()} activos`}
        value={selectedEmployeeIds}
        onChange={setSelectedEmployeeIds}
        excludeIds={excludeIds}
        activeOnly
        clearValueOnCompanyChange={false}
        placeholder="Nombre o teléfono"
        description="Buscá y agregá uno o más colaboradores. Usá Enter o coma para confirmar."
        maxVisibleChips={4}
      />

      {isRecurring ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="Desde"
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.currentTarget.value)}
            error={validityErrors.validFrom}
            description={formatDateInputDisplay(validFrom)}
            required
          />
          <TextInput
            label="Hasta"
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.currentTarget.value)}
            error={validityErrors.validUntil}
            description={
              validUntil.trim()
                ? formatDateInputDisplay(validUntil)
                : "Opcional. Vacío = sin fecha de fin."
            }
          />
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          Fecha de la operación: {formatDateInputDisplay(operationWorkDate)}
        </Text>
      )}

      {errorMessage ? (
        <Text size="sm" c="red">
          {errorMessage}
        </Text>
      ) : null}

      {skipped.length > 0 ? (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            No asignados
          </Text>
          {skipped.map((item) => (
            <Badge key={item.employeeId} color="yellow" variant="light">
              {item.employeeName ?? item.employeeId}: {item.reason}
            </Badge>
          ))}
        </Stack>
      ) : null}

      <Button
        onClick={() => {
          void handleAssign();
        }}
        loading={loading}
        disabled={selectedEmployeeIds.length === 0 || (isRecurring && hasValidityErrors)}
      >
        {assignLabel}
      </Button>
    </Stack>
  );
}
