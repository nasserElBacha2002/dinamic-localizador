import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useRecommendWorkTeam } from "../../hooks/useOperationRecommendations";
import { useServices } from "../../hooks/useServices";
import type {
  TeamRecommendationMember,
  TeamRecommendationOption,
  TeamRecommendationResponse,
} from "../../types/recommendation";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatAffinityLabel,
  formatRecommendationReasons,
} from "../../utils/recommendation-reasons";

export interface WorkTeamAiCreationPanelProps {
  onApplyMembers: (employeeIds: string[]) => void;
}

function locksFromMembers(members: TeamRecommendationMember[]): string[] {
  return members.filter((m) => m.locked).map((m) => m.employee.id);
}

export function WorkTeamAiCreationPanel({ onApplyMembers }: WorkTeamAiCreationPanelProps) {
  const [open, setOpen] = useState(false);
  const [teamSize, setTeamSize] = useState(6);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [recommendationSnapshot, setRecommendationSnapshot] =
    useState<TeamRecommendationResponse | null>(null);
  const [selectedRank, setSelectedRank] = useState(1);
  const [draftMembers, setDraftMembers] = useState<TeamRecommendationMember[]>([]);
  const [draftDirty, setDraftDirty] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const servicesQuery = useServices({ page: 1, limit: 100, active: true });
  const recommendMutation = useRecommendWorkTeam();

  const serviceOptions = useMemo(
    () =>
      (servicesQuery.data?.data ?? []).map((service) => ({
        value: service.id,
        label: service.name,
      })),
    [servicesQuery.data?.data],
  );

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
  const canApplyComplete = !draftDirty && !incomplete && draftMembers.length === teamSize;

  const applyAlternative = (option: TeamRecommendationOption) => {
    setSelectedRank(option.rank);
    setDraftMembers(option.members);
    setLockedIds(locksFromMembers(option.members));
    setDraftDirty(false);
  };

  const handleGenerate = async (locks?: string[]) => {
    setErrorMessage(null);
    try {
      const data = await recommendMutation.mutateAsync({
        teamSize,
        alternatives: 3,
        lockedEmployeeIds: locks ?? lockedIds,
        serviceId: serviceId || null,
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

  if (!open) {
    return (
      <Button variant="light" onClick={() => setOpen(true)} aria-label="Crear grupo con IA">
        ✨ Crear grupo con IA
      </Button>
    );
  }

  return (
    <Stack
      gap="md"
      p="md"
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "var(--mantine-radius-md)",
      }}
    >
      <Group justify="space-between">
        <Text fw={600}>✨ Crear grupo con IA</Text>
        <Button variant="subtle" size="xs" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </Group>

      <Text size="sm" c="dimmed">
        La IA propone integrantes. Revisá el equipo y aplicá los miembros al formulario antes de
        crear el grupo.
      </Text>

      <NumberInput
        label="Tamaño deseado"
        min={2}
        max={20}
        value={teamSize}
        onChange={(value) => setTeamSize(typeof value === "number" ? value : Number(value) || 2)}
        aria-label="Tamaño deseado del grupo"
      />

      <Select
        label="Contexto de sucursal (opcional)"
        placeholder="Sin sucursal"
        clearable
        searchable
        data={serviceOptions}
        value={serviceId}
        onChange={(value) => setServiceId(value)}
        description="Sin sucursal, la IA no usa experiencia ni proximidad de servicio."
      />

      <Button loading={recommendMutation.isPending} onClick={() => void handleGenerate()}>
        Generar equipo
      </Button>

      {errorMessage ? (
        <Alert color="red" title="No se pudo generar" role="alert">
          <Text size="sm">{errorMessage}</Text>
        </Alert>
      ) : null}

      {draftMembers.length > 0 ? (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>Equipo propuesto</Text>
            {!draftDirty && selectedAlternative ? (
              <Badge variant="light" aria-label={formatAffinityLabel(selectedAlternative.score)}>
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

          {!draftDirty && (recommendationSnapshot?.recommendations.length ?? 0) > 1 ? (
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
              <Button size="xs" variant="subtle" onClick={handleNextAlternative}>
                Generar otra opción
              </Button>
            </Group>
          ) : null}

          <Stack gap="xs" component="ul" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {draftMembers.map((member) => (
              <Group key={member.employee.id} justify="space-between" component="li">
                <Text size="sm">{member.employee.name}</Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant={lockedIds.includes(member.employee.id) ? "filled" : "subtle"}
                    onClick={() => {
                      setLockedIds((prev) =>
                        prev.includes(member.employee.id)
                          ? prev.filter((id) => id !== member.employee.id)
                          : [...prev, member.employee.id],
                      );
                      setDraftMembers((prev) =>
                        prev.map((m) =>
                          m.employee.id === member.employee.id
                            ? {
                                ...m,
                                locked: !m.locked,
                                role: !m.locked ? "LOCKED" : "SUGGESTED",
                              }
                            : m,
                        ),
                      );
                      setDraftDirty(true);
                    }}
                    aria-label={`Fijar a ${member.employee.name}`}
                  >
                    Fijar
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      setDraftMembers((prev) =>
                        prev.filter((m) => m.employee.id !== member.employee.id),
                      );
                      setLockedIds((prev) => prev.filter((id) => id !== member.employee.id));
                      setDraftDirty(true);
                    }}
                    aria-label={`Quitar a ${member.employee.name}`}
                  >
                    Quitar
                  </Button>
                </Group>
              </Group>
            ))}
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
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          ) : null}

          <Group>
            <Button
              disabled={!canApplyComplete || recommendMutation.isPending}
              onClick={() => {
                onApplyMembers(draftMembers.map((m) => m.employee.id));
              }}
            >
              Usar estos integrantes
            </Button>
            <Button
              variant="light"
              loading={recommendMutation.isPending}
              onClick={() => void handleGenerate(lockedIds)}
            >
              Completar nuevamente con IA
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Stack>
  );
}
