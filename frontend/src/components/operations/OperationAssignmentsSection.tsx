import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { SectionCard } from "../../design-system";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import {
  useAssignOperationEmployee,
  useCancelOperationAssignment,
  useEndOperationAssignment,
  useOperationEmployees,
} from "../../hooks/useOperations";
import type { OperationEmployeeAssignment, OperationKind } from "../../types/operation";
import { terminology } from "../../domain/terminology";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import { getApiErrorMessage, parseApiError } from "../../utils/errors";
import { EndAssignmentDialog } from "./EndAssignmentDialog";
import { OperationAssignmentList } from "./OperationAssignmentList";
import {
  isCurrentOperationalAssignment,
  mapAssignmentErrorMessage,
} from "./operation-assignment-display";

interface OperationAssignmentsSectionProps {
  operationId: string;
  operationKind: OperationKind;
  canAssign: boolean;
  operationWorkDate: string;
  activeEmployeeIds: string[];
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function OperationAssignmentsSection({
  operationId,
  operationKind,
  canAssign,
  operationWorkDate,
  activeEmployeeIds,
  onFeedback,
}: OperationAssignmentsSectionProps) {
  const assignmentsQuery = useOperationEmployees(operationId);
  const assignMutation = useAssignOperationEmployee(operationId);
  const cancelMutation = useCancelOperationAssignment(operationId);
  const endMutation = useEndOperationAssignment(operationId);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [endTarget, setEndTarget] = useState<OperationEmployeeAssignment | null>(null);

  const isRecurring = operationKind === "RECURRING";

  const assignments = assignmentsQuery.data ?? [];
  const currentAssignments = useMemo(
    () => assignments.filter(isCurrentOperationalAssignment),
    [assignments],
  );
  const historyAssignments = useMemo(
    () => assignments.filter((item) => !isCurrentOperationalAssignment(item)),
    [assignments],
  );

  const handleAssign = async () => {
    if (!selectedEmployeeId) {
      return;
    }

    try {
      await assignMutation.mutateAsync({
        employeeId: selectedEmployeeId,
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });
      setSelectedEmployeeId("");
      setValidUntil("");
      onFeedback(`${terminology.worker.singular} asignado correctamente.`, "success");
    } catch (error) {
      const parsed = parseApiError(error);
      onFeedback(
        mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error)),
        "error",
      );
    }
  };

  const handleCancel = async (assignment: OperationEmployeeAssignment) => {
    try {
      await cancelMutation.mutateAsync(assignment.id);
      onFeedback("Asignación cancelada correctamente.", "success");
    } catch (error) {
      const parsed = parseApiError(error);
      onFeedback(
        mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error)),
        "error",
      );
    }
  };

  const handleEnd = async (effectiveDate: string) => {
    if (!endTarget) {
      return;
    }

    try {
      await endMutation.mutateAsync({
        assignmentId: endTarget.id,
        effectiveDate,
      });
      setEndTarget(null);
      onFeedback("Asignación finalizada correctamente.", "success");
    } catch (error) {
      const parsed = parseApiError(error);
      onFeedback(
        mapAssignmentErrorMessage(parsed.code, getApiErrorMessage(error)),
        "error",
      );
      throw error;
    }
  };

  return (
    <SectionCard
      title="Colaboradores asignados"
      description="Vigencia de asignaciones para esta operación."
    >
      {canAssign ? (
        <Stack gap="xs" mb="md">
          <EmployeeSearchAutocomplete
            label={`${terminology.worker.singular} activo`}
            value={selectedEmployeeId || null}
            onChange={(id) => setSelectedEmployeeId(id ?? "")}
            excludeIds={activeEmployeeIds}
            descriptionMode="assignment"
            helperText="Buscá por nombre. Verás tipo y último día trabajado."
            placeholder="Nombre o teléfono"
          />
          {isRecurring ? (
            <Group grow align="flex-end">
              <TextInput
                type="date"
                label="Desde"
                value={validFrom}
                onChange={(event) => setValidFrom(event.currentTarget.value)}
              />
              <TextInput
                type="date"
                label="Hasta"
                description="Sin fecha de finalización"
                value={validUntil}
                onChange={(event) => setValidUntil(event.currentTarget.value)}
              />
            </Group>
          ) : (
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Vigencia
              </Text>
              <Text size="sm">{formatDateInputDisplay(operationWorkDate)}</Text>
              <Text size="xs" c="dimmed">
                Esta asignación aplica a la fecha de la operación.
              </Text>
            </Stack>
          )}
          <Group justify="flex-end">
            <Button
              onClick={() => void handleAssign()}
              disabled={!selectedEmployeeId || assignMutation.isPending}
              loading={assignMutation.isPending}
            >
              Asignar colaborador
            </Button>
          </Group>
        </Stack>
      ) : null}

      {assignmentsQuery.isLoading ? (
        <Text size="sm" c="dimmed">
          Cargando asignaciones...
        </Text>
      ) : null}

      {assignmentsQuery.isError ? (
        <Text size="sm" c="red">
          {getApiErrorMessage(assignmentsQuery.error, "No se pudieron cargar las asignaciones.")}
        </Text>
      ) : null}

      {currentAssignments.length > 0 ? (
        <OperationAssignmentList
          assignments={currentAssignments}
          operationWorkDate={operationWorkDate}
          canAssign={canAssign}
          cancelPending={cancelMutation.isPending}
          endPending={endMutation.isPending}
          onCancel={(assignment) => void handleCancel(assignment)}
          onEnd={setEndTarget}
        />
      ) : !assignmentsQuery.isLoading ? (
        <Text size="sm" c="dimmed">
          No hay asignaciones actuales.
        </Text>
      ) : null}

      {historyAssignments.length > 0 ? (
        <Stack gap="xs" mt="lg">
          <Text size="sm" fw={600}>
            Historial de asignaciones
          </Text>
          <OperationAssignmentList
            assignments={historyAssignments}
            operationWorkDate={operationWorkDate}
            canAssign={false}
            onCancel={() => {}}
            onEnd={() => {}}
          />
        </Stack>
      ) : null}

      <EndAssignmentDialog
        open={Boolean(endTarget)}
        employeeName={endTarget?.employee ? endTarget.employee.name : "El colaborador"}
        loading={endMutation.isPending}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEnd}
      />
    </SectionCard>
  );
}
