import {
  Badge,
  Button,
  Group,
  MultiSelect,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "../../hooks/useCompany";
import {
  invalidateOperationAssignmentQueries,
  useConfirmWorkTeamAssignment,
  usePreviewWorkTeamAssignment,
  useWorkTeams,
} from "../../hooks/useWorkTeams";
import type { OperationKind } from "../../types/operation";
import type { WorkTeamAssignPreviewResult } from "../../types/work-team";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import {
  operationAttendanceKeys,
  operationEmployeeKeys,
  operationKeys,
} from "../../queryKeys/operations";
import {
  getApiErrorMessage,
  isRecurringWorkdaySyncError,
  parseApiError,
} from "../../utils/errors";
import { employeeTypeLabels } from "../../utils/labels";
import {
  buildWorkTeamSelectOptions,
  getWorkTeamPreviewDisabledReason,
} from "../../utils/work-team-assignment-ui";

const skipReasonLabels: Record<string, string> = {
  already_assigned: "Ya asignado",
  duplicate_in_request: "Duplicado entre grupos",
  assignment_period_overlap: "Solapamiento temporal",
  employee_inactive: "Colaborador inactivo",
  employee_not_found: "Colaborador no encontrado",
};

export interface WorkTeamAssignmentPanelProps {
  operationId: string;
  operationKind: OperationKind;
  operationWorkDate: string;
  enabled?: boolean;
  onCompleted: (message: string, severity: "success" | "error") => void;
  onFinished?: () => void;
}

export function WorkTeamAssignmentPanel(props: WorkTeamAssignmentPanelProps) {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.companyId ?? null;
  const panelKey = props.enabled
    ? `${companyId ?? "no-company"}:${props.operationId}:${props.operationWorkDate}`
    : "disabled";

  if (!props.enabled) {
    return null;
  }

  return <WorkTeamAssignmentPanelContent key={panelKey} companyId={companyId} {...props} />;
}

function WorkTeamAssignmentPanelContent({
  operationId,
  operationKind,
  operationWorkDate,
  companyId,
  onCompleted,
  onFinished,
}: WorkTeamAssignmentPanelProps & { companyId: string | null }) {
  const isRecurring = operationKind === "RECURRING";
  const queryClient = useQueryClient();

  const teamsQuery = useWorkTeams({ page: 1, limit: 100, active: true }, true);
  const previewMutation = usePreviewWorkTeamAssignment(operationId);
  const confirmMutation = useConfirmWorkTeamAssignment(operationId);

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState(operationWorkDate || getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [preview, setPreview] = useState<WorkTeamAssignPreviewResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const teamOptions = useMemo(
    () => buildWorkTeamSelectOptions(teamsQuery.data?.data ?? []),
    [teamsQuery.data?.data],
  );

  const resetState = () => {
    setSelectedTeamIds([]);
    setValidFrom(operationWorkDate || getTodayDateInput());
    setValidUntil("");
    setPreview(null);
    setErrorMessage(null);
  };

  const teamsLoading = teamsQuery.isCompanyLoading || teamsQuery.isPending;
  const teamsLoaded = !teamsLoading && !teamsQuery.isError;
  const hasActiveTeams = (teamsQuery.data?.data?.length ?? 0) > 0;

  const previewDisabledReason = getWorkTeamPreviewDisabledReason({
    isCompanyLoading: teamsQuery.isCompanyLoading,
    teamsLoading: teamsQuery.isPending,
    teamsError: teamsQuery.isError,
    hasActiveTeams,
    selectedTeamIds,
    validFrom,
    validUntil,
    isRecurring,
  });

  const teamSelectionMessage = teamsLoading
    ? "Cargando grupos de trabajo..."
    : teamsQuery.isError
      ? "No se pudieron cargar los grupos de trabajo."
      : teamsLoaded && !hasActiveTeams
        ? "No hay grupos de trabajo activos disponibles."
        : previewDisabledReason;

  const handlePreview = async () => {
    if (previewDisabledReason) {
      setErrorMessage(previewDisabledReason);
      return;
    }

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
      try {
        await invalidateOperationAssignmentQueries(queryClient, companyId ?? undefined, operationId);
        await queryClient.refetchQueries({
          queryKey: operationEmployeeKeys.list(companyId ?? undefined, operationId),
          type: "active",
        });
        await queryClient.refetchQueries({
          queryKey: operationKeys.detail(companyId ?? undefined, operationId),
          type: "active",
        });
        await queryClient.refetchQueries({
          queryKey: operationAttendanceKeys.summary(companyId ?? undefined, operationId),
          type: "active",
        });
      } catch {
        onCompleted(
          "La asignación se realizó, pero no se pudo actualizar la vista. Intentá volver a cargar.",
          "success",
        );
        resetState();
        onFinished?.();
        return;
      }

      onCompleted(
        `${result.summary.added} colaborador(es) asignado(s), ${result.summary.skipped} omitido(s).`,
        result.summary.added > 0 ? "success" : "error",
      );
      resetState();
      onFinished?.();
    } catch (error) {
      const parsed = parseApiError(error);
      // Assignment persisted, but recurring workday materialization stayed
      // pending. The confirm mutation already invalidated the operation caches;
      // treat it as a success with a clear pending notice and close.
      if (isRecurringWorkdaySyncError(error)) {
        await invalidateOperationAssignmentQueries(queryClient, companyId ?? undefined, operationId);
        onCompleted(
          "La asignación fue realizada. La actualización de jornadas quedó pendiente.",
          "success",
        );
        resetState();
        onFinished?.();
        return;
      }
      if (parsed.code === "WORK_TEAM_PREVIEW_STALE" || parsed.code === "WORK_TEAM_PREVIEW_EXPIRED") {
        setPreview(null);
      }
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Seleccioná uno o más grupos activos. La asignación copiará colaboradores como asignaciones
        individuales sin modificar el grupo.
      </Text>

      <Stack gap={4}>
        <MultiSelect
          label="Grupos de trabajo"
          description={
            selectedTeamIds.length > 0
              ? `${selectedTeamIds.length} grupo(s) seleccionado(s)`
              : "Podés seleccionar varios grupos"
          }
          placeholder={teamsLoading ? "Cargando grupos..." : "Seleccioná uno o más grupos"}
          data={teamOptions}
          value={selectedTeamIds}
          onChange={setSelectedTeamIds}
          searchable
          clearable
          nothingFoundMessage={
            teamsLoaded && !hasActiveTeams
              ? "No hay grupos de trabajo activos disponibles."
              : "No se encontraron grupos"
          }
          disabled={Boolean(preview) || teamsLoading}
          aria-label="Grupos de trabajo"
        />

        {teamSelectionMessage ? (
          <Text size="sm" c={teamsQuery.isError ? "red" : "dimmed"}>
            {teamSelectionMessage}
          </Text>
        ) : null}

        {teamsLoaded && !hasActiveTeams ? (
          <Button component={Link} to="/work-teams/new" variant="light" size="compact-sm">
            Crear grupo de trabajo
          </Button>
        ) : null}
      </Stack>

      {isRecurring ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="md">
          <TextInput
            type="date"
            label="Desde"
            value={validFrom}
            onChange={(event) => setValidFrom(event.currentTarget.value)}
            disabled={Boolean(preview)}
            required
          />
          <TextInput
            type="date"
            label="Hasta (opcional)"
            value={validUntil}
            onChange={(event) => setValidUntil(event.currentTarget.value)}
            disabled={Boolean(preview)}
          />
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          La asignación aplicará a la fecha de la operación:{" "}
          {formatDateInputDisplay(operationWorkDate)}.
        </Text>
      )}

      {!preview ? (
        <Button
          onClick={() => void handlePreview()}
          loading={previewMutation.isPending}
          disabled={Boolean(previewDisabledReason) || teamsLoading || teamsQuery.isError}
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
            <Button onClick={() => void handleConfirm()} loading={confirmMutation.isPending}>
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
  );
}
