import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { useOperationEmployeeRecommendations } from "../../hooks/useOperationRecommendations";
import type { OperationKind } from "../../types/operation";
import type { IndividualEmployeeRecommendation } from "../../types/recommendation";
import { terminology } from "../../domain/terminology";
import { formatDateInputDisplay } from "../../utils/date-range";
import { getTodayDateInput } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatAffinityLabel,
  formatRecommendationReasons,
  recommendationHeadline,
} from "../../utils/recommendation-reasons";
import {
  getRecurringValidityErrors,
  hasRecurringValidityErrors,
} from "../../utils/work-team-assignment-ui";
import type { AssignEmployeesResult } from "./OperationIndividualAssignmentPanel";
import { OperationAiTeamRecommendationPanel } from "./OperationAiTeamRecommendationPanel";

const DEFAULT_VISIBLE = 5;
const FETCH_LIMIT = 10;

export interface OperationAiRecommendationsPanelProps {
  operationId: string;
  operationKind: OperationKind;
  operationWorkDate: string;
  excludeEmployeeIds: string[];
  /** Lazy: only fetch while the AI tab is visible. */
  enabled: boolean;
  assignLoading?: boolean;
  onAssign: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<AssignEmployeesResult>;
  onResult?: (result: AssignEmployeesResult) => void;
}

export function OperationAiRecommendationsPanel({
  operationId,
  operationKind,
  operationWorkDate,
  excludeEmployeeIds,
  enabled,
  assignLoading = false,
  onAssign,
  onResult,
}: OperationAiRecommendationsPanelProps) {
  const [aiMode, setAiMode] = useState<"people" | "team">("people");
  const isRecurring = operationKind === "RECURRING";
  const [validFrom, setValidFrom] = useState(getTodayDateInput());
  const [validUntil, setValidUntil] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const validityErrors = useMemo(
    () =>
      isRecurring
        ? getRecurringValidityErrors(validFrom, validUntil)
        : { validFrom: null, validUntil: null },
    [isRecurring, validFrom, validUntil],
  );
  const hasValidityErrors = hasRecurringValidityErrors(validityErrors);
  const recommendationDateReady = !isRecurring || !validityErrors.validFrom;

  const recommendationsQuery = useOperationEmployeeRecommendations(
    operationId,
    {
      limit: FETCH_LIMIT,
      effectiveDate: isRecurring && recommendationDateReady ? validFrom : null,
      dateReady: recommendationDateReady,
    },
    enabled && aiMode === "people",
  );

  const excluded = useMemo(() => new Set(excludeEmployeeIds), [excludeEmployeeIds]);

  const ranked = useMemo(() => {
    const list = recommendationsQuery.data?.recommendations ?? [];
    return list
      .filter((item) => !excluded.has(item.employee.id))
      .slice()
      .sort((a, b) => a.rank - b.rank);
  }, [recommendationsQuery.data?.recommendations, excluded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return ranked;
    }
    return ranked.filter((item) => item.employee.name.toLowerCase().includes(q));
  }, [ranked, search]);

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE);

  const handleAssign = async (item: IndividualEmployeeRecommendation) => {
    if (isRecurring && hasValidityErrors) {
      setErrorMessage("Revisá las fechas de vigencia antes de asignar.");
      return;
    }

    setErrorMessage(null);
    setAssigningId(item.employee.id);
    try {
      const result = await onAssign({
        employeeIds: [item.employee.id],
        ...(isRecurring
          ? {
              validFrom,
              validUntil: validUntil.trim() ? validUntil : null,
            }
          : {}),
      });
      onResult?.(result);
      if (result.status === "error" || result.skipped.length > 0) {
        const skipped = result.skipped[0];
        setErrorMessage(skipped?.reason ?? "No se pudo asignar al colaborador recomendado.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo completar la asignación.",
      );
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <Stack gap="md">
      {aiMode === "team" ? (
        <Stack gap="sm">
          <Button
            variant="subtle"
            color="ai"
            size="xs"
            w="fit-content"
            onClick={() => setAiMode("people")}
          >
            ← Volver a personas sugeridas
          </Button>
          <OperationAiTeamRecommendationPanel
            operationId={operationId}
            operationKind={operationKind}
            operationWorkDate={operationWorkDate}
            existingMemberCount={excludeEmployeeIds.length}
            enabled={enabled}
            assignLoading={assignLoading}
            onAssign={onAssign}
            onResult={onResult}
          />
        </Stack>
      ) : (
        <>
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
            <Text size="sm" c="dimmed" maw={420}>
              Ranking de personas según el equipo actual. Elegí a quién agregar, o pedí un equipo
              completo.
            </Text>
            <Button size="xs" variant="light" color="ai" onClick={() => setAiMode("team")}>
              Sugerir equipo completo
            </Button>
          </Group>

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

          <TextInput
            label="Buscar en recomendaciones"
            placeholder="Nombre"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setShowAll(false);
            }}
            description="Filtra sin cambiar el orden de ranking de la IA."
          />

          {recommendationsQuery.isPending ? (
            <Alert color="ai" title="✨ Buscando sugerencias" withCloseButton={false}>
              Analizando historial y contexto de la operación…
            </Alert>
          ) : null}

          {recommendationsQuery.isError ? (
            <Alert
              color="red"
              title="No pudimos generar recomendaciones con IA"
              withCloseButton={false}
            >
              <Stack gap="xs">
                <Text size="sm">{getApiErrorMessage(recommendationsQuery.error)}</Text>
                <Text size="sm" c="dimmed">
                  Podés seguir asignando colaboradores desde las otras pestañas.
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => {
                    void recommendationsQuery.refetch();
                  }}
                >
                  Reintentar
                </Button>
              </Stack>
            </Alert>
          ) : null}

          {!recommendationsQuery.isPending &&
          !recommendationsQuery.isError &&
          filtered.length === 0 ? (
            <Text size="sm" c="dimmed" role="status">
              {ranked.length === 0
                ? `No hay ${terminology.worker.plural.toLowerCase()} disponibles para recomendar ahora.`
                : "Ninguna recomendación coincide con la búsqueda."}
            </Text>
          ) : null}

          {errorMessage ? (
            <Text size="sm" c="red" role="alert">
              {errorMessage}
            </Text>
          ) : null}

          {visible.length > 0 ? (
            <Stack gap="sm" role="list" aria-label="Recomendaciones con IA">
              {visible.map((item) => {
                const reasonLines = formatRecommendationReasons(item.reasons);
                const headline = recommendationHeadline(item.reasons);
                const isAssigning = assigningId === item.employee.id;

                return (
                  <Stack
                    key={item.employee.id}
                    gap="xs"
                    p="sm"
                    role="listitem"
                    style={{
                      background: "var(--mantine-color-ai-0)",
                      border: "1px solid var(--mantine-color-ai-2)",
                      borderRadius: "var(--mantine-radius-md)",
                    }}
                  >
                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" wrap="wrap">
                          <Text fw={600}>{item.employee.name}</Text>
                          <Badge color="ai" variant="light" size="sm">
                            IA
                          </Badge>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {formatAffinityLabel(item.score)}
                          {headline ? ` · ${headline}` : null}
                        </Text>
                        {item.employee.categoryName ? (
                          <Text size="xs" c="dimmed">
                            {item.employee.categoryName}
                          </Text>
                        ) : null}
                      </Stack>
                      <Button
                        size="sm"
                        color="ai"
                        loading={isAssigning || (assignLoading && assigningId === item.employee.id)}
                        disabled={
                          Boolean(assigningId) ||
                          assignLoading ||
                          (isRecurring && hasValidityErrors)
                        }
                        onClick={() => {
                          void handleAssign(item);
                        }}
                        aria-label={`Asignar a ${item.employee.name}`}
                      >
                        Agregar
                      </Button>
                    </Group>

                    {reasonLines.length > 0 ? (
                      <Accordion variant="contained" radius="md">
                        <Accordion.Item value="why">
                          <Accordion.Control>¿Por qué?</Accordion.Control>
                          <Accordion.Panel>
                            <Stack
                              gap={4}
                              component="ul"
                              style={{ margin: 0, paddingLeft: "1.1rem" }}
                            >
                              {reasonLines.map((line) => (
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
              })}
            </Stack>
          ) : null}

          {!showAll && filtered.length > DEFAULT_VISIBLE ? (
            <Button variant="subtle" color="ai" onClick={() => setShowAll(true)}>
              Ver más ({filtered.length})
            </Button>
          ) : null}
        </>
      )}
    </Stack>
  );
}
