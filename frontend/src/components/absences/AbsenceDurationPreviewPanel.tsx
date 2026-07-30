import { Alert, Stack, Text } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AbsenceDurationPreview } from "../../types/absence-calendar";
import { getApiErrorMessage } from "../../utils/errors";

export function AbsenceDurationPreviewPanel({
  query,
}: {
  query: UseQueryResult<AbsenceDurationPreview, unknown>;
}) {
  if (query.isFetching && !query.data) {
    return (
      <Text size="sm" c="dimmed">
        Calculando duración…
      </Text>
    );
  }

  if (query.isError) {
    return <Alert color="red">{getApiErrorMessage(query.error)}</Alert>;
  }

  if (!query.data) {
    return null;
  }

  const countingLabel =
    query.data.countingMode === "BUSINESS_DAYS" ? "días hábiles" : "días corridos";

  return (
    <Alert color="gray">
      <Stack gap={4}>
        <Text size="sm">
          Duración calculada: {query.data.totalDays} {countingLabel}
          {query.isFetching ? " (actualizando…)" : ""}
        </Text>
        <Text size="xs" c="dimmed">
          Zona horaria: {query.data.timezone}
        </Text>
        {query.data.warnings?.map((warning) => (
          <Text key={warning} size="sm">
            {warning}
          </Text>
        ))}
        {query.data.excludedSummary.length > 0 ? (
          <Text size="sm">
            Se excluyen: {query.data.excludedSummary.slice(0, 8).join(", ")}
            {query.data.excludedSummary.length > 8 ? "…" : ""}
          </Text>
        ) : null}
        {query.data.partialDays > 0 ? (
          <Text size="sm">Incluye medios días: {query.data.partialDays}</Text>
        ) : null}
      </Stack>
    </Alert>
  );
}
