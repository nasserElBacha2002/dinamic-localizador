import {
  Accordion,
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { AiSuggestionCard } from "../ai/AiSuggestionCard";
import {
  useOperationTeamRecommendation,
  useRecommendOperationTeam,
} from "../../hooks/useOperationRecommendations";
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
  /** When false, do not auto-fetch (e.g. parent tab hidden). */
  enabled?: boolean;
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
  enabled = true,
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
  const [pauseAutoQuery, setPauseAutoQuery] = useState(false);

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

  const autoQuery = useOperationTeamRecommendation(
    operationId,
    {
      teamSize,
      alternatives: 3,
      lockedEmployeeIds: [],
      effectiveDate: isRecurring && recommendationDateReady ? validFrom : null,
    },
    enabled &&
      recommendationDateReady &&
      !draftDirty &&
      !pauseAutoQuery &&
      teamSize >= Math.max(2, existingMemberCount),
  );

  const sourceSnapshot: TeamRecommendationResponse | null =
    draftDirty || pauseAutoQuery
      ? recommendationSnapshot
      : (autoQuery.data ?? recommendationSnapshot);

  const selectedAlternative: TeamRecommendationOption | null = useMemo(() => {
    if (!sourceSnapshot) {
      return null;
    }
    return (
      sourceSnapshot.recommendations.find((item) => item.rank === selectedRank) ??
      sourceSnapshot.recommendations[0] ??
      null
    );
  }, [sourceSnapshot, selectedRank]);

  const displayMembers = draftDirty
    ? draftMembers
    : (selectedAlternative?.members ?? draftMembers);

  const incomplete = displayMembers.length < teamSize;
  const missingCount = Math.max(0, teamSize - displayMembers.length);
  const canUseCompleteRecommendation =
    !draftDirty && !incomplete && displayMembers.length === teamSize;
  const busy =
    recommendMutation.isPending ||
    assigning ||
    assignLoading ||
    (autoQuery.isFetching && !draftDirty && !pauseAutoQuery);

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
    setPauseAutoQuery(true);
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
    if (!sourceSnapshot || draftDirty) {
      return;
    }
    const ranks = sourceSnapshot.recommendations.map((r) => r.rank).sort((a, b) => a - b);
    if (ranks.length < 2) {
      return;
    }
    const idx = ranks.indexOf(selectedAlternative?.rank ?? selectedRank);
    const nextRank = ranks[(idx + 1) % ranks.length]!;
    const option = sourceSnapshot.recommendations.find((r) => r.rank === nextRank);
    if (option) {
      setPauseAutoQuery(true);
      setRecommendationSnapshot(sourceSnapshot);
      applyAlternative(option);
    }
  };

  const handleRemoveSuggested = (employeeId: string) => {
    const base = draftDirty ? draftMembers : displayMembers;
    setDraftMembers(base.filter((m) => m.employee.id !== employeeId || m.alreadyAssigned));
    setLockedIds((prev) => prev.filter((id) => id !== employeeId));
    setDraftDirty(true);
    setPauseAutoQuery(true);
    if (sourceSnapshot) {
      setRecommendationSnapshot(sourceSnapshot);
    }
  };

  const handleToggleLock = (employeeId: string) => {
    const base = draftDirty ? draftMembers : displayMembers;
    if (!draftDirty) {
      setDraftMembers(base);
      if (sourceSnapshot) {
        setRecommendationSnapshot(sourceSnapshot);
      }
    }
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
    setPauseAutoQuery(true);
  };

  const handleUseTeam = async () => {
    if (!canUseCompleteRecommendation) {
      setErrorMessage(
        incomplete
          ? `${displayMembers.length} de ${teamSize} integrantes. Falta ${missingCount}.`
          : "Completá nuevamente con IA para recalcular afinidad antes de usar el equipo.",
      );
      return;
    }
    if (isRecurring && hasValidityErrors) {
      setErrorMessage("Revisá las fechas de vigencia antes de asignar.");
      return;
    }
    const toAssign = displayMembers.filter((m) => !m.alreadyAssigned).map((m) => m.employee.id);
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

  const alternativeCount = sourceSnapshot?.recommendations.length ?? 0;
  const isLoadingSuggestion =
    enabled && !draftDirty && !pauseAutoQuery && (autoQuery.isPending || autoQuery.isFetching);
  const queryError =
    !draftDirty && !pauseAutoQuery && autoQuery.isError
      ? getApiErrorMessage(autoQuery.error)
      : null;

  return (
    <Stack gap="md">
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
        label="Tamaño del equipo"
        description={
          existingMemberCount > 0
            ? `${existingMemberCount} ya asignadas · faltan ~${slotsHint}`
            : "Incluye a quienes ya están asignados"
        }
        min={Math.max(2, existingMemberCount)}
        max={20}
        value={teamSize}
        onChange={(value) => {
          setTeamSize(typeof value === "number" ? value : Number(value) || 2);
          setPauseAutoQuery(false);
          setDraftDirty(false);
          setRecommendationSnapshot(null);
        }}
        aria-label="Cantidad total de personas del equipo"
      />

      {isLoadingSuggestion ? (
        <AiSuggestionCard title="✨ Sugerencia de equipo" loading />
      ) : null}

      {(errorMessage || queryError) && !isLoadingSuggestion ? (
        <AiSuggestionCard
          title="✨ Sugerencia de equipo"
          errorMessage={errorMessage ?? queryError}
          onRetry={() => {
            setErrorMessage(null);
            setPauseAutoQuery(false);
            setDraftDirty(false);
            void autoQuery.refetch();
          }}
        />
      ) : null}

      {!isLoadingSuggestion && displayMembers.length > 0 ? (
        <AiSuggestionCard
          title="✨ Sugerencia de equipo"
          scoreLabel={
            !draftDirty && selectedAlternative
              ? formatAffinityLabel(selectedAlternative.score)
              : null
          }
          actions={
            <>
              <Button
                size="xs"
                color="ai"
                onClick={() => void handleUseTeam()}
                loading={assigning || assignLoading}
                disabled={busy || !canUseCompleteRecommendation}
              >
                Usar este equipo
              </Button>
              {!draftDirty && alternativeCount > 1 ? (
                <Button
                  size="xs"
                  variant="light"
                  color="ai"
                  onClick={handleNextAlternative}
                  aria-label="Generar otra opción"
                >
                  Otra opción
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="subtle"
                color="ai"
                onClick={() => void handleGenerate(lockedIds)}
                loading={recommendMutation.isPending}
                disabled={busy && !recommendMutation.isPending}
              >
                {draftDirty ? "Completar nuevamente con IA" : "Actualizar"}
              </Button>
            </>
          }
        >
          <Stack gap="xs">
            {draftDirty ? (
              <Text size="sm" c="dimmed">
                Modificaste el equipo. Completalo nuevamente con IA para recalcular afinidad.
              </Text>
            ) : null}
            {incomplete ? (
              <Text size="sm" c="orange">
                {displayMembers.length} de {teamSize} integrantes. Falta {missingCount}.
              </Text>
            ) : null}
            {!draftDirty && alternativeCount > 1 ? (
              <Group gap="xs">
                {sourceSnapshot!.recommendations.map((option) => (
                  <Button
                    key={option.rank}
                    size="compact-xs"
                    variant={option.rank === (selectedAlternative?.rank ?? selectedRank) ? "filled" : "light"}
                    color="ai"
                    onClick={() => {
                      setPauseAutoQuery(true);
                      setRecommendationSnapshot(sourceSnapshot);
                      applyAlternative(option);
                    }}
                    aria-label={`Ver alternativa ${option.rank}`}
                  >
                    {option.rank === 1 ? "Recomendado" : `Alt. ${option.rank}`}
                  </Button>
                ))}
              </Group>
            ) : null}
            <Stack gap={4} component="ul" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {displayMembers.map((member) => {
                const badge = memberBadge(member);
                const canRemove = !member.alreadyAssigned;
                const canLock = !member.alreadyAssigned;
                return (
                  <Group
                    key={member.employee.id}
                    justify="space-between"
                    wrap="nowrap"
                    component="li"
                  >
                    <Stack gap={0} style={{ minWidth: 0 }}>
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
                          size="compact-xs"
                          variant={lockedIds.includes(member.employee.id) ? "filled" : "subtle"}
                          color="ai"
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
                          size="compact-xs"
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
                  <Accordion.Control>¿Por qué?</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={4} component="ul">
                      {formatRecommendationReasons(selectedAlternative.reasons).map((line) => (
                        <Text key={line} size="sm" component="li">
                          {line}
                        </Text>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            ) : null}
          </Stack>
        </AiSuggestionCard>
      ) : null}
    </Stack>
  );
}
