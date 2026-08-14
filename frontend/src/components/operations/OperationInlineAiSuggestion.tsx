import { Accordion, Button, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { AiSuggestionCard } from "../ai/AiSuggestionCard";
import { useOperationEmployeeRecommendations } from "../../hooks/useOperationRecommendations";
import type { OperationKind } from "../../types/operation";
import type { IndividualEmployeeRecommendation } from "../../types/recommendation";
import { getTodayDateInput } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatAffinityLabel,
  formatRecommendationReasons,
  recommendationHeadline,
} from "../../utils/recommendation-reasons";
import type { AssignEmployeesResult } from "./OperationIndividualAssignmentPanel";

export interface OperationInlineAiSuggestionProps {
  operationId: string;
  operationKind: OperationKind;
  excludeEmployeeIds: string[];
  enabled: boolean;
  assignLoading?: boolean;
  onAssign: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<AssignEmployeesResult>;
  onResult?: (result: AssignEmployeesResult) => void;
  onSeeMore: () => void;
}

/**
 * Compact proactive individual suggestion for the normal team-manage flow.
 */
export function OperationInlineAiSuggestion({
  operationId,
  operationKind,
  excludeEmployeeIds,
  enabled,
  assignLoading = false,
  onAssign,
  onResult,
  onSeeMore,
}: OperationInlineAiSuggestionProps) {
  const isRecurring = operationKind === "RECURRING";
  const [assigning, setAssigning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const validFrom = getTodayDateInput();

  const query = useOperationEmployeeRecommendations(
    operationId,
    {
      limit: 10,
      effectiveDate: isRecurring ? validFrom : null,
      dateReady: true,
    },
    enabled,
  );

  const excluded = useMemo(() => new Set(excludeEmployeeIds), [excludeEmployeeIds]);

  const top: IndividualEmployeeRecommendation | null = useMemo(() => {
    const list = query.data?.recommendations ?? [];
    const ranked = list
      .filter((item) => !excluded.has(item.employee.id))
      .slice()
      .sort((a, b) => a.rank - b.rank);
    return ranked[0] ?? null;
  }, [query.data?.recommendations, excluded]);

  const reasonLines = top ? formatRecommendationReasons(top.reasons).slice(0, 2) : [];
  const headline = top ? recommendationHeadline(top.reasons) : null;

  const handleAdd = async () => {
    if (!top) {
      return;
    }
    setLocalError(null);
    setAssigning(true);
    try {
      const result = await onAssign({
        employeeIds: [top.employee.id],
        ...(isRecurring ? { validFrom, validUntil: null } : {}),
      });
      onResult?.(result);
      if (result.status === "error" || result.skipped.length > 0) {
        setLocalError(result.skipped[0]?.reason ?? "No se pudo agregar al colaborador sugerido.");
      }
    } catch (error) {
      setLocalError(getApiErrorMessage(error));
    } finally {
      setAssigning(false);
    }
  };

  if (!enabled) {
    return null;
  }

  if (query.isLoading || query.isFetching) {
    return <AiSuggestionCard title="✨ Sugerencia de IA" loading />;
  }

  if (query.isError) {
    return (
      <AiSuggestionCard
        title="✨ Sugerencia de IA"
        errorMessage="No pudimos cargar una sugerencia. Podés seguir asignando manualmente."
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!top) {
    return null;
  }

  return (
    <Stack gap="xs">
      <AiSuggestionCard
        title="✨ Sugerencia de IA"
        scoreLabel={formatAffinityLabel(top.score)}
        actions={
          <>
            <Button
              size="xs"
              color="ai"
              loading={assigning || assignLoading}
              onClick={() => void handleAdd()}
              aria-label={`Agregar a ${top.employee.name}`}
            >
              Agregar
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="ai"
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
            >
              Ver por qué
            </Button>
            <Button size="xs" variant="light" color="ai" onClick={onSeeMore}>
              Ver más recomendaciones
            </Button>
          </>
        }
      >
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {top.employee.name}
          </Text>
          {headline || reasonLines[0] ? (
            <Text size="sm" c="dimmed">
              {headline ?? reasonLines[0]}
            </Text>
          ) : null}
          {reasonLines[1] && reasonLines[1] !== headline ? (
            <Text size="sm" c="dimmed">
              {reasonLines[1]}
            </Text>
          ) : null}
          {localError ? (
            <Text size="sm" c="red">
              {localError}
            </Text>
          ) : null}
        </Stack>
      </AiSuggestionCard>

      {whyOpen ? (
        <Accordion variant="contained" defaultValue="why" color="ai">
          <Accordion.Item value="why">
            <Accordion.Control>¿Por qué la IA lo recomienda?</Accordion.Control>
            <Accordion.Panel>
              <Stack gap={4} component="ul">
                {formatRecommendationReasons(top.reasons).map((line) => (
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
