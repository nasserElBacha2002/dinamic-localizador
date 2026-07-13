import {
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useWorkTeams, usePreviewWorkTeamAssignment, useConfirmWorkTeamAssignment } from "../../hooks/useWorkTeams";
import type { OperationKind } from "../../types/operation";
import type { WorkTeamAssignPreviewResult } from "../../types/work-team";
import { getTodayDateInput } from "../../utils/dates";
import { getApiErrorMessage, parseApiError } from "../../utils/errors";
import { employeeTypeLabels } from "../../utils/labels";

const skipReasonLabels: Record<string, string> = {
  already_assigned: "Ya asignado",
  duplicate_in_request: "Duplicado entre grupos",
  assignment_period_overlap: "Solapamiento temporal",
  employee_inactive: "Colaborador inactivo",
  employee_not_found: "Colaborador no encontrado",
};

interface WorkTeamAssignmentModalProps {
  opened: boolean;
  onClose: () => void;
  operationId: string;
  operationKind: OperationKind;
  onCompleted: (message: string, severity: "success" | "error") => void;
}

export function WorkTeamAssignmentModal({
  opened,
  onClose,
  operationId,
  operationKind,
  onCompleted,
}: WorkTeamAssignmentModalProps) {
  const isRecurring = operationKind === "RECURRING";
  const teamsQuery = useWorkTeams({ page: 1, limit: 100, active: true }, opened);
  const previewMutation = usePreviewWorkTeamAssignment(operationId);
  const confirmMutation = useConfirmWorkTeamAssignment(operationId);

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [preview, setPreview] = useState<WorkTeamAssignPreviewResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const teamOptions = useMemo(
    () =>
      (teamsQuery.data?.data ?? []).map((team) => ({
        value: team.id,
        label: `${team.name} (${team.activeMemberCount ?? 0} activos)`,
      })),
    [teamsQuery.data?.data],
  );

  const resetState = () => {
    setSelectedTeamIds([]);
    setValidFrom(getTodayDateInput());
    setValidUntil("");
    setPreview(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handlePreview = async () => {
    setErrorMessage(null);
    try {
      const result = await previewMutation.mutateAsync({
        workTeamIds: selectedTeamIds,
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });
      setPreview(result);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleConfirm = async () => {
    if (!preview) {
      return;
    }
    setErrorMessage(null);
    try {
      const result = await confirmMutation.mutateAsync(preview.previewToken);
      onCompleted(
        `${result.summary.added} colaborador(es) asignado(s), ${result.summary.skipped} omitido(s).`,
        result.summary.added > 0 ? "success" : "error",
      );
      handleClose();
    } catch (error) {
      const parsed = parseApiError(error);
      if (parsed.code === "WORK_TEAM_PREVIEW_STALE" || parsed.code === "WORK_TEAM_PREVIEW_EXPIRED") {
        setPreview(null);
      }
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Asignar desde grupos"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Seleccioná uno o más grupos activos. La asignación copiará colaboradores como asignaciones
          individuales sin modificar el grupo.
        </Text>

        <MultiSelect
          label="Grupos de trabajo"
          data={teamOptions}
          value={selectedTeamIds}
          onChange={setSelectedTeamIds}
          searchable
          nothingFoundMessage="No hay grupos activos"
          disabled={Boolean(preview)}
        />

        {isRecurring ? (
          <Group grow>
            <TextInput
              type="date"
              label="Desde"
              value={validFrom}
              onChange={(event) => setValidFrom(event.currentTarget.value)}
              disabled={Boolean(preview)}
            />
            <TextInput
              type="date"
              label="Hasta"
              description="Opcional"
              value={validUntil}
              onChange={(event) => setValidUntil(event.currentTarget.value)}
              disabled={Boolean(preview)}
            />
          </Group>
        ) : null}

        {!preview ? (
          <Button
            onClick={handlePreview}
            loading={previewMutation.isPending}
            disabled={selectedTeamIds.length === 0}
          >
            Previsualizar asignación
          </Button>
        ) : (
          <Stack gap="sm">
            <Text fw={600}>Resumen de previsualización</Text>
            <Text size="sm">
              Asignables: {preview.summary.assignable} · Omitidos: {preview.summary.skipped}
            </Text>
            {preview.assignableEmployees.map((entry) => (
              <Text key={entry.employeeId} size="sm">
                ✓ {entry.employee.name} · {employeeTypeLabels[entry.employee.employeeType]}
              </Text>
            ))}
            {preview.skippedEmployees.map((entry) => (
              <Group key={`${entry.employeeId}-${entry.reason}`} gap="xs">
                <Text size="sm" c="dimmed">
                  ✗ {entry.employee.name}
                </Text>
                <Badge variant="light" color="gray">
                  {skipReasonLabels[entry.reason] ?? entry.reason}
                </Badge>
              </Group>
            ))}
            <Group>
              <Button onClick={handleConfirm} loading={confirmMutation.isPending}>
                Confirmar asignación
              </Button>
              <Button variant="default" onClick={() => setPreview(null)}>
                Volver
              </Button>
            </Group>
          </Stack>
        )}

        {errorMessage ? (
          <Text size="sm" c="red">
            {errorMessage}
          </Text>
        ) : null}
      </Stack>
    </Modal>
  );
}
