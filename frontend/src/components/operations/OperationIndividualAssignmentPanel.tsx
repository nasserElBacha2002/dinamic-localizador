import { Badge, Button, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import type { OperationKind } from "../../types/operation";
import type { ScheduleMode } from "../../types/operation-shift";
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

export type CoverageAssignmentTarget = {
  replacedAssignmentId: string;
  replacedEmployeeId: string;
  replacedEmployeeName?: string;
  operationShiftId?: string | null;
  shiftLabel?: string | null;
};

export interface OperationIndividualAssignmentPanelProps {
  operationKind: OperationKind;
  scheduleMode?: ScheduleMode;
  operationWorkDate: string;
  excludeEmployeeIds: string[];
  shiftOptions?: Array<{ value: string; label: string }>;
  /** Shared shift selection (e.g. dialog-level for AI + manual). */
  selectedShiftId?: string | null;
  onSelectedShiftIdChange?: (shiftId: string | null) => void;
  /** When true, parent already renders the shift selector. */
  hideShiftSelect?: boolean;
  /** When set, panel runs in coverage/replacement mode (fixed shift, single API fields). */
  coverageTarget?: CoverageAssignmentTarget | null;
  loading?: boolean;
  onAssign: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
    operationShiftId?: string | null;
    asCoverage?: boolean;
    replacedAssignmentId?: string;
    replacedEmployeeId?: string;
  }) => Promise<AssignEmployeesResult>;
  onResult?: (result: AssignEmployeesResult) => void;
}

export function OperationIndividualAssignmentPanel({
  operationKind,
  scheduleMode = "SINGLE",
  operationWorkDate,
  excludeEmployeeIds,
  shiftOptions = [],
  selectedShiftId: controlledShiftId,
  onSelectedShiftIdChange,
  hideShiftSelect = false,
  coverageTarget = null,
  loading = false,
  onAssign,
  onResult,
}: OperationIndividualAssignmentPanelProps) {
  const isRecurring = operationKind === "RECURRING";
  const isMultiShift = scheduleMode === "MULTI_SHIFT";
  const isCoverage = Boolean(coverageTarget);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [uncontrolledShiftId, setUncontrolledShiftId] = useState<string | null>(
    shiftOptions.length === 1 ? shiftOptions[0]!.value : null,
  );
  const selectedShiftId = controlledShiftId !== undefined ? controlledShiftId : uncontrolledShiftId;
  const setSelectedShiftId = onSelectedShiftIdChange ?? setUncontrolledShiftId;
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<AssignEmployeesResult["skipped"]>([]);

  const replacedEmployeeId = coverageTarget?.replacedEmployeeId ?? null;
  const excludeIds = useMemo(() => {
    const ids = [...excludeEmployeeIds];
    if (replacedEmployeeId) {
      ids.push(replacedEmployeeId);
    }
    return [...new Set(ids)];
  }, [excludeEmployeeIds, replacedEmployeeId]);

  const validityErrors = useMemo(
    () => (isRecurring ? getRecurringValidityErrors(validFrom, validUntil) : { validFrom: null, validUntil: null }),
    [isRecurring, validFrom, validUntil],
  );
  const hasValidityErrors = hasRecurringValidityErrors(validityErrors);
  const missingShift = isMultiShift && !isCoverage && !selectedShiftId;

  const coverageShiftLabel =
    coverageTarget?.shiftLabel?.trim() ||
    (coverageTarget?.operationShiftId
      ? shiftOptions.find((option) => option.value === coverageTarget.operationShiftId)?.label
      : null) ||
    (isMultiShift ? "Turno de la asignación reemplazada" : null);

  const handleAssign = async () => {
    if (selectedEmployeeIds.length === 0) {
      setErrorMessage(
        isCoverage
          ? "Seleccioná el colaborador de cobertura."
          : "Seleccioná al menos un colaborador.",
      );
      return;
    }

    if (isCoverage && selectedEmployeeIds.length !== 1) {
      setErrorMessage("La cobertura admite un solo colaborador por vez.");
      return;
    }

    if (missingShift) {
      setErrorMessage("Seleccioná el turno para la asignación.");
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
        ...(isCoverage
          ? {
              asCoverage: true,
              replacedAssignmentId: coverageTarget!.replacedAssignmentId,
              replacedEmployeeId: coverageTarget!.replacedEmployeeId,
              // Backend inherits shift from replaced assignment — omit unless same id is known.
            }
          : isMultiShift
            ? { operationShiftId: selectedShiftId }
            : {}),
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });

      if (result.status === "error") {
        setSkipped(result.skipped);
        setErrorMessage(result.skipped[0]?.reason ?? "No se pudo completar la asignación.");
        onResult?.(result);
        return;
      }

      const addedIds = new Set(result.added);
      setSelectedEmployeeIds((current) => current.filter((id) => !addedIds.has(id)));
      setSkipped(result.skipped);
      onResult?.(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo completar la asignación.");
    }
  };

  const assignLabel = isCoverage
    ? "Asignar cobertura"
    : selectedEmployeeIds.length <= 1
      ? `Asignar ${terminology.worker.singular.toLowerCase()}`
      : `Asignar ${selectedEmployeeIds.length} ${terminology.worker.plural.toLowerCase()}`;

  return (
    <Stack gap="md">
      {isCoverage ? (
        <Stack gap={4}>
          <Text size="sm">
            Cobertura de{" "}
            <Text span fw={500}>
              {coverageTarget?.replacedEmployeeName ?? "colaborador reemplazado"}
            </Text>
            .
          </Text>
          {coverageShiftLabel ? (
            <TextInput
              label="Turno"
              description="Heredado de la asignación reemplazada (no editable)."
              value={coverageShiftLabel}
              readOnly
            />
          ) : null}
        </Stack>
      ) : null}

      <EmployeeMultiSelect
        label={
          isCoverage
            ? `Colaborador de cobertura`
            : `Buscar ${terminology.worker.plural.toLowerCase()} activos`
        }
        value={selectedEmployeeIds}
        onChange={(ids) => setSelectedEmployeeIds(isCoverage ? ids.slice(-1) : ids)}
        excludeIds={excludeIds}
        activeOnly
        clearValueOnCompanyChange={false}
        placeholder="Nombre o teléfono"
        description={
          isCoverage
            ? "Seleccioná un colaborador distinto al cubierto."
            : "Buscá y agregá uno o más colaboradores. Usá Enter o coma para confirmar."
        }
        maxVisibleChips={4}
      />

      {isMultiShift && !isCoverage && !hideShiftSelect ? (
        <Select
          label="Turno"
          description="Obligatorio en operaciones multi-turno."
          data={shiftOptions}
          value={selectedShiftId}
          onChange={(value) => setSelectedShiftId(value)}
          placeholder={
            shiftOptions.length === 0
              ? "No hay turnos activos"
              : "Seleccioná el turno"
          }
          required
          disabled={shiftOptions.length === 0}
          error={missingShift ? "Seleccioná un turno" : undefined}
        />
      ) : null}

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
        disabled={
          selectedEmployeeIds.length === 0 ||
          missingShift ||
          (isCoverage && selectedEmployeeIds.length !== 1) ||
          (isRecurring && hasValidityErrors)
        }
      >
        {assignLabel}
      </Button>
    </Stack>
  );
}
