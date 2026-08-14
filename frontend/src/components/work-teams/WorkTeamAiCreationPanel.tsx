import { Accordion, Button, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import {
  AiSuggestionAppliedNotice,
  AiSuggestionCard,
} from "../ai/AiSuggestionCard";
import { useServices } from "../../hooks/useServices";
import { useWorkTeamTeamRecommendation } from "../../hooks/useOperationRecommendations";
import type { TeamRecommendationOption } from "../../types/recommendation";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatAffinityLabel,
  formatRecommendationReasons,
} from "../../utils/recommendation-reasons";

function idsFingerprint(ids: string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join("|");
}

function memberNamesSummary(option: TeamRecommendationOption): string {
  const names = option.members.map((m) => m.employee.name);
  if (names.length <= 4) {
    return names.join(" · ");
  }
  const head = names.slice(0, 4).join(" · ");
  return `${head} y ${names.length - 4} más`;
}

function suggestionTitle(lockedCount: number): string {
  if (lockedCount === 0) {
    return "✨ Sugerencia de IA";
  }
  if (lockedCount === 1) {
    return "✨ Para trabajar con el colaborador seleccionado";
  }
  return "✨ Para completar este equipo";
}

export interface WorkTeamAiCreationPanelProps {
  selectedEmployeeIds: string[];
  onApplyMembers: (employeeIds: string[]) => void;
}

/**
 * Proactive work-team AI suggestion card.
 * Auto-fetches when slots remain; selected members are sent as lockedEmployeeIds.
 */
export function WorkTeamAiCreationPanel({
  selectedEmployeeIds,
  onApplyMembers,
}: WorkTeamAiCreationPanelProps) {
  const [teamSize, setTeamSize] = useState(6);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [selectedRank, setSelectedRank] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [appliedFingerprint, setAppliedFingerprint] = useState<string | null>(null);

  const lockedIds = selectedEmployeeIds;
  const slotsRemain = lockedIds.length < teamSize;
  const currentFingerprint = idsFingerprint(lockedIds);
  const suggestionFullyApplied =
    appliedFingerprint !== null && appliedFingerprint === currentFingerprint && !slotsRemain;
  const teamFilledWithoutSuggestion = !slotsRemain && !suggestionFullyApplied;

  const servicesQuery = useServices({ page: 1, limit: 100, active: true });
  const serviceOptions = useMemo(
    () =>
      (servicesQuery.data?.data ?? []).map((service) => ({
        value: service.id,
        label: service.name,
      })),
    [servicesQuery.data?.data],
  );

  const recommendationQuery = useWorkTeamTeamRecommendation(
    {
      teamSize,
      alternatives: 3,
      lockedEmployeeIds: lockedIds,
      serviceId,
    },
    !suggestionFullyApplied && !teamFilledWithoutSuggestion && slotsRemain && teamSize >= 2,
  );

  const recommendations = useMemo(
    () => recommendationQuery.data?.recommendations ?? [],
    [recommendationQuery.data?.recommendations],
  );

  const activeOption = useMemo(
    () =>
      recommendations.find((item) => item.rank === selectedRank) ?? recommendations[0] ?? null,
    [recommendations, selectedRank],
  );

  const reasonPreview = activeOption
    ? formatRecommendationReasons(activeOption.reasons).slice(0, 2)
    : [];

  const handleApply = () => {
    if (!activeOption) {
      return;
    }
    const ids = activeOption.members.map((m) => m.employee.id);
    setAppliedFingerprint(idsFingerprint(ids));
    onApplyMembers(ids);
  };

  const handleNextAlternative = () => {
    if (recommendations.length < 2) {
      return;
    }
    const ranks = recommendations.map((r) => r.rank).sort((a, b) => a - b);
    const current = activeOption?.rank ?? ranks[0]!;
    const idx = ranks.indexOf(current);
    const next = ranks[(idx + 1) % ranks.length]!;
    setSelectedRank(next);
    setAppliedFingerprint(null);
  };

  const handleOtherAfterApplied = () => {
    setAppliedFingerprint(null);
    setTeamSize((size) => Math.min(20, Math.max(size + 1, lockedIds.length + 1)));
  };

  const title = suggestionTitle(lockedIds.length);

  if (suggestionFullyApplied || teamFilledWithoutSuggestion) {
    return (
      <Stack gap="sm">
        {suggestionFullyApplied ? (
          <AiSuggestionAppliedNotice onOtherOption={handleOtherAfterApplied} />
        ) : (
          <Text size="sm" c="dimmed" role="status">
            El equipo ya tiene el tamaño deseado. Aumentalo para pedir otra sugerencia.
          </Text>
        )}
        <NumberInput
          label="Tamaño deseado"
          min={2}
          max={20}
          value={teamSize}
          onChange={(value) => {
            setTeamSize(typeof value === "number" ? value : Number(value) || 2);
            setAppliedFingerprint(null);
          }}
          aria-label="Tamaño deseado del grupo"
        />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group grow preventGrowOverflow={false} align="flex-end">
        <NumberInput
          label="Tamaño deseado"
          min={2}
          max={20}
          value={teamSize}
          onChange={(value) => setTeamSize(typeof value === "number" ? value : Number(value) || 2)}
          aria-label="Tamaño deseado del grupo"
        />
        <Select
          label="Sucursal (opcional)"
          placeholder="Sin sucursal"
          clearable
          searchable
          data={serviceOptions}
          value={serviceId}
          onChange={(value) => setServiceId(value)}
        />
      </Group>

      {recommendationQuery.isPending ? <AiSuggestionCard title={title} loading /> : null}

      {recommendationQuery.isError ? (
        <AiSuggestionCard
          title={title}
          errorMessage={getApiErrorMessage(recommendationQuery.error)}
          onRetry={() => void recommendationQuery.refetch()}
        />
      ) : null}

      {!recommendationQuery.isPending && !recommendationQuery.isError && activeOption ? (
        <AiSuggestionCard
          title={title}
          scoreLabel={formatAffinityLabel(activeOption.score)}
          actions={
            <>
              <Button size="xs" color="ai" onClick={handleApply}>
                Aplicar sugerencia
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="ai"
                onClick={() => setDetailOpen((v) => !v)}
              >
                Ver detalle
              </Button>
              {recommendations.length > 1 ? (
                <Button size="xs" variant="light" color="ai" onClick={handleNextAlternative}>
                  Otra opción
                </Button>
              ) : null}
            </>
          }
        >
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {memberNamesSummary(activeOption)}
            </Text>
            {reasonPreview.map((line) => (
              <Text key={line} size="sm" c="dimmed">
                {line}
              </Text>
            ))}
          </Stack>
        </AiSuggestionCard>
      ) : null}

      {detailOpen && activeOption ? (
        <Accordion variant="contained" defaultValue="detail">
          <Accordion.Item value="detail">
            <Accordion.Control>Detalle de la sugerencia</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs" component="ul" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {activeOption.members.map((member) => (
                  <Text key={member.employee.id} size="sm" component="li">
                    {member.employee.name}
                    {lockedIds.includes(member.employee.id) ? " (ya seleccionado)" : ""}
                  </Text>
                ))}
              </Stack>
              <Stack gap={4} mt="sm" component="ul">
                {formatRecommendationReasons(activeOption.reasons).map((line) => (
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
  );
}
