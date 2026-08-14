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
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useRecommendWorkTeam } from "../../hooks/useOperationRecommendations";
import { useServices } from "../../hooks/useServices";
import type { TeamRecommendationMember, TeamRecommendationResponse } from "../../types/recommendation";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatAffinityLabel,
  formatRecommendationReasons,
} from "../../utils/recommendation-reasons";

export interface WorkTeamAiCreationPanelProps {
  onApplyMembers: (employeeIds: string[]) => void;
}

export function WorkTeamAiCreationPanel({ onApplyMembers }: WorkTeamAiCreationPanelProps) {
  const [open, setOpen] = useState(false);
  const [teamSize, setTeamSize] = useState(6);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [nameHint, setNameHint] = useState("");
  const [result, setResult] = useState<TeamRecommendationResponse | null>(null);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<TeamRecommendationMember[] | null>(null);
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

  const option = result?.recommendations[0] ?? null;
  const members = draft ?? option?.members ?? [];

  const handleGenerate = async (locks?: string[]) => {
    setErrorMessage(null);
    try {
      const data = await recommendMutation.mutateAsync({
        teamSize,
        alternatives: 2,
        lockedEmployeeIds: locks ?? lockedIds,
        serviceId: serviceId || null,
      });
      setResult(data);
      const first = data.recommendations[0];
      setDraft(first?.members ?? null);
      setLockedIds(
        (first?.members ?? [])
          .filter((m) => m.locked)
          .map((m) => m.employee.id),
      );
    } catch (error) {
      setResult(null);
      setDraft(null);
      setErrorMessage(getApiErrorMessage(error));
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

      <TextInput
        label="Nombre sugerido (opcional, solo ayuda local)"
        value={nameHint}
        onChange={(event) => setNameHint(event.currentTarget.value)}
        description="No se envía a la IA; podés copiarlo al nombre del grupo."
      />

      <Button loading={recommendMutation.isPending} onClick={() => void handleGenerate()}>
        Generar equipo
      </Button>

      {errorMessage ? (
        <Alert color="red" title="No se pudo generar" role="alert">
          <Text size="sm">{errorMessage}</Text>
        </Alert>
      ) : null}

      {option && members.length > 0 ? (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={500}>Equipo propuesto</Text>
            <Badge variant="light" aria-label={formatAffinityLabel(option.score)}>
              {formatAffinityLabel(option.score)}
            </Badge>
          </Group>

          <Stack gap="xs" component="ul" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {members.map((member) => (
              <Group key={member.employee.id} justify="space-between" component="li">
                <Text size="sm">{member.employee.name}</Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant={lockedIds.includes(member.employee.id) ? "filled" : "subtle"}
                    onClick={() =>
                      setLockedIds((prev) =>
                        prev.includes(member.employee.id)
                          ? prev.filter((id) => id !== member.employee.id)
                          : [...prev, member.employee.id],
                      )
                    }
                    aria-label={`Fijar a ${member.employee.name}`}
                  >
                    Fijar
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      setDraft((prev) =>
                        (prev ?? members).filter((m) => m.employee.id !== member.employee.id),
                      );
                      setLockedIds((prev) => prev.filter((id) => id !== member.employee.id));
                    }}
                    aria-label={`Quitar a ${member.employee.name}`}
                  >
                    Quitar
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>

          <Accordion variant="contained">
            <Accordion.Item value="why">
              <Accordion.Control>¿Por qué la IA recomienda este equipo?</Accordion.Control>
              <Accordion.Panel>
                <Stack gap={4} component="ul">
                  {formatRecommendationReasons(option.reasons).map((line) => (
                    <Text key={line} size="sm" component="li">
                      {line}
                    </Text>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Group>
            <Button
              onClick={() => {
                onApplyMembers(members.map((m) => m.employee.id));
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
