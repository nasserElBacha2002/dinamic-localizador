import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useRecommendOperationTeam } from "../../hooks/useOperationRecommendations";
import type { OperationKind } from "../../types/operation";
import type {
  TeamRecommendationMember,
  TeamRecommendationOption,
  TeamRecommendationResponse,
} from "../../types/recommendation";
import { terminology } from "../../domain/terminology";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatAffinityLabel,
  formatRecommendationReasons,
} from "../../utils/recommendation-reasons";
import {
  getRecurringValidityErrors,
  hasRecurringValidityErrors,
} from "../../utils/work-team-assignment-ui";
import type { AssignEmployeesResult } from "./OperationIndividualAssignmentPanel";

export interface OperationAiTeamRecommendationPanelProps {
  operationId: string;
  operationKind: OperationKind;
  operationWorkDate: string;
  existingMemberCount: number;
  assignLoading?: boolean;
  onAssign: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<AssignEmployeesResult>;
  onResult?: (result: AssignEmployeesResult) => void;
}

function memberBadge(member: TeamRecommendationMember): { label: string; color: string } {
  if (member.role === "EXISTING" || member.alreadyAssigned) {
    return { label: "Ya asignado", color: "gray" };
  }
  if (member.locked || member.role === "LOCKED") {
    return { label: "Fijo", color: "blue" };
  }
  return { label: "Sugerido", color: "teal" };
}

function locksFromMembers(members: TeamRecommendationMember[]): string[] {
  return members
    .filter((m) => m.alreadyAssigned || m.locked)
    .map((m) => m.employee.id);
}

export function OperationAiTeamRecommendationPanel({
  operationId,
  operationKind,
  operationWorkDate,
  existingMemberCount,
  assignLoading = false,
  onAssign,
  onResult,
}: OperationAiTeamRecommendationPanelProps) {
  const isRecurring = operationKind === "RECURRING";
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [teamSize, setTeamSize] = useState(Math.max(6, existingMemberCount + 2));
  const [recommendationSnapshot, setRecommendationSnapshot] =
    useState<TeamRecommendationResponse | null>(null);
  const [selectedRank, setSelectedRank] = useState(1);
  const [draftMembers, setDraftMembers] = useState<TeamRecommendationMember[]>([]);
  const [draftDirty, setDraftDirty] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const recommendMutation = useRecommendOperationTeam(operationId);

  const validityErrors = useMemo(
    () =>
      isRecurring
        ? getRecurringValidityErrors(validFrom, validUntil)
        : { validFrom: null, validUntil: null },
    [isRecurring, validFrom, validUntil],
  );
  const hasValidityErrors = hasRecurringValidityErrors(validityErrors);
  const recommendationDateReady = !isRecurring || !validityErrors.validFrom;

  const slotsHint = Math.max(0, teamSize - existingMemberCount);

  const selectedAlternative: TeamRecommendationOption | null = useMemo(() => {
    if (!recommendationSnapshot) {
      return null;
    }
    return (
      recommendationSnapshot.recommendations.find((item) => item.rank === selectedRank) ??
      recommendationSnapshot.recommendations[0] ??
      null
    );
  }, [recommendationSnapshot, selectedRank]);

  const incomplete = draftMembers.length < teamSize;
  const missingCount = Math.max(0, teamSize - draftMembers.length);
  const canUseCompleteRecommendation = !draftDirty && !incomplete && draftMembers.length === teamSize;
  const busy = recommendMutation.isPending || assigning || assignLoading;

  const applyAlternative = (option: TeamRecommendationOption) => {
    setSelectedRank(option.rank);
    setDraftMembers(option.members);
    setLockedIds(locksFromMembers(option.members));
    setDraftDirty(false);
  };

  const handleGenerate = async (overrideLocked?: string[]) => {
    if (isRecurring && !recommendationDateReady) {
      setErrorMessage("Revisá la fecha de vigencia antes de generar el equipo.");
      return;
    }
    if (teamSize < 2 || teamSize > 20) {
      setErrorMessage("La cantidad total debe estar entre 2 y 20.");
      return;
    }
    if (teamSize < existingMemberCount) {
      setErrorMessage(
        `Ya hay ${existingMemberCount} personas asignadas; el tamaño total debe ser al menos ese valor.`,
      );
      return;
    }

    setErrorMessage(null);
    try {
      const data = await recommendMutation.mutateAsync({
        teamSize,
        alternatives: 3,
        lockedEmployeeIds: overrideLocked ?? lockedIds,
        ...(isRecurring ? { effectiveDate: validFrom } : {}),
      });
      setRecommendationSnapshot(data);
      const first = data.recommendations[0];
      if (first) {
        applyAlternative(first);
      } else {
        setDraftMembers([]);
        setDraftDirty(false);
      }
    } catch (error) {
      setRecommendationSnapshot(null);
      setDraftMembers([]);
      setDraftDirty(false);
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  const handleNextAlternative = () => {
    if (!recommendationSnapshot || draftDirty) {
      return;
    }
    const ranks = recommendationSnapshot.recommendations.map((r) => r.rank).sort((a, b) => a - b);
    if (ranks.length < 2) {
      return;
    }
    const idx = ranks.indexOf(selectedRank);
    const nextRank = ranks[(idx + 1) % ranks.length]!;
    const option = recommendationSnapshot.recommendations.find((r) => r.rank === nextRank);
    if (option) {
      applyAlternative(option);
    }
  };

  const handleRemoveSuggested = (employeeId: string) => {
    setDraftMembers((prev) =>
      prev.filter((m) => m.employee.id !== employeeId || m.alreadyAssigned),
    );
    setLockedIds((prev) => prev.filter((id) => id !== employeeId));
    setDraftDirty(true);
  };

  const handleToggleLock = (employeeId: string) => {
    setLockedIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
    setDraftMembers((prev) =>
      prev.map((m) =>
        m.employee.id === employeeId && !m.alreadyAssigned
          ? { ...m, locked: !m.locked, role: !m.locked ? "LOCKED" : "SUGGESTED" }
          : m,
      ),
    );
    setDraftDirty(true);
  };

  const handleUseTeam = async () => {
    if (!canUseCompleteRecommendation) {
      setErrorMessage(
        incomplete
          ? `${draftMembers.length} de ${teamSize} integrantes. Falta ${missingCount}.`
          : "Completá nuevamente con IA para recalcular afinidad antes de usar el equipo.",
      );
      return;
    }
    if (isRecurring && hasValidityErrors) {
      setErrorMessage("Revisá las fechas de vigencia antes de asignar.");
      return;
    }
    const toAssign = draftMembers.filter((m) => !m.alreadyAssigned).map((m) => m.employee.id);
    if (toAssign.length === 0) {
      setErrorMessage("No hay integrantes nuevos para asignar.");
      return;
    }

    setErrorMessage(null);
    setAssigning(true);
    try {
      const assignResult = await onAssign({
        employeeIds: toAssign,
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });
      onResult?.(assignResult);
      if (assignResult.status === "error") {
        setErrorMessage("No se pudo asignar el equipo sugerido.");
      } else if (assignResult.skipped.length > 0) {
        setErrorMessage(
          `Asignación parcial: ${assignResult.skipped.length} no se pudieron asignar. Revisá el equipo.`,
        );
        void handleGenerate(lockedIds);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo completar la asignación.",
      );
    } finally {
      setAssigning(false);
    }
  };

  const alternativeCount = recommendationSnapshot?.recommendations.length ?? 0;

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        La IA propone un equipo completo según afinidad histórica, experiencia y proximidad.
        El tamaño es el total del equipo (incluye a quienes ya están asignados).
      </Text>

      {isRecurring ? (
        <Group grow preventGrowOverflow={false} align="flex-start">
          <TextInput
            label={`Vigencia desde (${terminology.operation})`}
            type="date"
            value={validFrom}
            onChange={(event) => setValidFrom(event.currentTarget.value)}
            error={validityErrors.validFrom}
            description={
              operationWorkDate
                ? `Fecha de operación: ${formatDateInputDisplay(operationWorkDate)}`
                : undefined
            }
          />
          <TextInput
            label="Vigencia hasta (opcional)"
            type="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.currentTarget.value)}
            error={validityErrors.validUntil}
          />
        </Group>
      ) : null}

      <NumberInput
        label="Cantidad total de personas"
        description={
          existingMemberCount > 0
            ? `${existingMemberCount} ya asignadas. La IA buscará ${slotsHint} adicionales.`
            : "Tamaño final del equipo (mínimo 2)."
        }
        min={Math.max(2, existingMemberCount)}
        max={20}
        value={teamSize}
        onChange={(value) => setTeamSize(typeof value === "number" ? value : Number(value) || 2)}
        aria-label="Cantidad total de personas del equipo"
      />

      <Group>
        <Button
          onClick={() => void handleGenerate()}
          loading={recommendMutation.isPending}
          disabled={busy && !recommendMutation.isPending}
        >
          ✨ Armar equipo con IA
        </Button>
      </Group>

      {errorMessage ? (
        <Alert color="red" title="No se pudo completar" role="alert">
          <Text size="sm">{errorMessage}</Text>
        </Alert>
      ) : null}

      {draftMembers.length > 0 ? (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={600}>✨ Equipo sugerido por IA</Text>
            {!draftDirty && selectedAlternative ? (
              <Badge
                size="lg"
                variant="light"
                aria-label={formatAffinityLabel(selectedAlternative.score)}
              >
                {formatAffinityLabel(selectedAlternative.score)}
              </Badge>
            ) : null}
          </Group>

          {draftDirty ? (
            <Alert color="yellow" title="Equipo modificado" role="status">
              <Text size="sm">
                Modificaste el equipo. Completalo nuevamente con IA para recalcular afinidad.
              </Text>
            </Alert>
          ) : null}

          {incomplete ? (
            <Alert color="orange" title="Equipo incompleto" role="status">
              <Text size="sm">
                {draftMembers.length} de {teamSize} integrantes. Falta {missingCount}.
              </Text>
            </Alert>
          ) : null}

          {!draftDirty && alternativeCount > 1 ? (
            <Group gap="xs">
              {recommendationSnapshot!.recommendations.map((option) => (
                <Button
                  key={option.rank}
                  size="xs"
                  variant={option.rank === selectedRank ? "filled" : "light"}
                  onClick={() => applyAlternative(option)}
                  aria-label={`Ver alternativa ${option.rank}`}
                >
                  {option.rank === 1 ? "Recomendado" : `Alt. ${option.rank}`}
                </Button>
              ))}
              <Button
                size="xs"
                variant="subtle"
                onClick={handleNextAlternative}
                aria-label="Generar otra opción"
              >
                Generar otra opción
              </Button>
            </Group>
          ) : null}

          <Stack gap="xs" component="ul" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {draftMembers.map((member) => {
              const badge = memberBadge(member);
              const canRemove = !member.alreadyAssigned;
              const canLock = !member.alreadyAssigned;
              return (
                <Group
                  key={member.employee.id}
                  justify="space-between"
                  wrap="nowrap"
                  p="xs"
                  style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}
                  component="li"
                >
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {member.employee.name}
                    </Text>
                    <Badge size="xs" color={badge.color} variant="light" w="fit-content">
                      {badge.label}
                    </Badge>
                  </Stack>
                  <Group gap="xs" wrap="nowrap">
                    {canLock ? (
                      <Button
                        size="xs"
                        variant={lockedIds.includes(member.employee.id) ? "filled" : "subtle"}
                        onClick={() => handleToggleLock(member.employee.id)}
                        aria-label={
                          lockedIds.includes(member.employee.id)
                            ? `Desbloquear a ${member.employee.name}`
                            : `Fijar a ${member.employee.name}`
                        }
                      >
                        {lockedIds.includes(member.employee.id) ? "Fijo" : "Fijar"}
                      </Button>
                    ) : null}
                    {canRemove ? (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemoveSuggested(member.employee.id)}
                        aria-label={`Quitar a ${member.employee.name} del equipo sugerido`}
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </Group>
                </Group>
              );
            })}
          </Stack>

          {!draftDirty && selectedAlternative ? (
            <Accordion variant="contained">
              <Accordion.Item value="why">
                <Accordion.Control>¿Por qué la IA recomienda este equipo?</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={4} component="ul">
                    {formatRecommendationReasons(selectedAlternative.reasons).map((line) => (
                      <Text key={line} size="sm" component="li">
                        {line}
                      </Text>
                    ))}
                    {formatRecommendationReasons(selectedAlternative.reasons).length === 0 ? (
                      <Text size="sm" c="dimmed">
                        La IA combinó señales disponibles para este contexto.
                      </Text>
                    ) : null}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ) : null}

          <Group>
            <Button
              onClick={() => void handleUseTeam()}
              loading={assigning || assignLoading}
              disabled={busy || !canUseCompleteRecommendation}
            >
              Usar este equipo
            </Button>
            <Button
              variant="light"
              onClick={() => void handleGenerate(lockedIds)}
              loading={recommendMutation.isPending}
              disabled={busy && !recommendMutation.isPending}
            >
              Completar nuevamente con IA
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Stack>
  );
}
