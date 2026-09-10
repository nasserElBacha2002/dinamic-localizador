import { Badge, Group, Paper, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { useNavigate } from "react-router";
import { MetricCard } from "../../design-system";
import type { AttendanceStatisticsSummary } from "../../types/statistics";
import { formatPercent } from "../../utils/export";
import {
  buildOperationalIncidentHref,
  type StatisticsDeepLinkContext,
  type StatisticsIncidentLinkKey,
} from "../../utils/statistics-deep-links";

interface OperationalIncidentsPanelProps {
  summary?: AttendanceStatisticsSummary;
  isLoading?: boolean;
  linkContext: StatisticsDeepLinkContext;
}

export function OperationalIncidentsPanel({
  summary,
  isLoading,
  linkContext,
}: OperationalIncidentsPanelProps) {
  const navigate = useNavigate();
  const incidents = summary?.operationalIncidents;
  const incidentsUnavailable =
    summary?.operationalIncidentsStatus === "UNAVAILABLE" ||
    incidents == null ||
    incidents.availability === "UNAVAILABLE";

  const evaluable = incidents?.evaluableOperations ?? 0;
  const affected = incidents?.operationsWithAnyIncident ?? 0;
  const rate = evaluable > 0 ? (affected / evaluable) * 100 : 0;

  const go = (key: StatisticsIncidentLinkKey) => {
    navigate(buildOperationalIncidentHref(key, linkContext));
  };

  if (!isLoading && incidentsUnavailable) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Operaciones con incidencias</Text>
          <Text size="sm" c="dimmed">
            Datos no disponibles
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={600}>Operaciones con incidencias</Text>
            <Text size="sm" c="dimmed">
              Los subtotales pueden superponerse: una misma operación puede tener más de un tipo
              de incidencia. El total cuenta operaciones únicas.
            </Text>
          </div>
          {incidents?.coverageReliableFrom && !incidents.coverageEventsReliableHistorically ? (
            <Tooltip label="Los eventos de cobertura son confiables desde esta fecha">
              <Badge variant="light" color="gray">
                Cobertura confiable desde {incidents.coverageReliableFrom}
              </Badge>
            </Tooltip>
          ) : null}
          {incidents?.changeEventsReliableFrom ? (
            <Tooltip label="Las modificaciones relevantes se registran de forma confiable desde esta fecha">
              <Badge variant="light" color="gray">
                Cambios confiables desde {incidents.changeEventsReliableFrom}
              </Badge>
            </Tooltip>
          ) : (
            <Badge variant="light" color="gray">
              Cambios: solo datos nuevos
            </Badge>
          )}
        </Group>

        <MetricCard
          title="Operaciones afectadas"
          loading={isLoading}
          value={isLoading ? "…" : affected}
          description={
            evaluable > 0
              ? `${formatPercent(rate)} sobre ${evaluable} operaciones evaluables`
              : "Sin operaciones evaluables en el período"
          }
          onClick={() => go("any_incident")}
          aria-label="Ver detalle de operaciones con incidencias"
        />

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <MetricCard
            title="Con reemplazo"
            loading={isLoading}
            value={incidents?.operationsWithCoverage ?? 0}
            description={`${incidents?.coverageEvents ?? 0} eventos de cobertura`}
            onClick={() => go("coverage_required")}
            aria-label="Ver operaciones con cobertura por reemplazo"
          />
          <MetricCard
            title="Modificadas"
            loading={isLoading}
            value={incidents?.modifiedOperations ?? 0}
            description={`${incidents?.operationChangeEvents ?? 0} cambios relevantes`}
            onClick={() => go("operation_modified")}
            aria-label="Ver operaciones modificadas"
          />
          <MetricCard
            title="Sin confirmar"
            loading={isLoading}
            value={incidents?.operationsWithUnconfirmedAssignments ?? 0}
            description={`${incidents?.notConfirmedBeforeStart ?? 0} asignaciones · ${incidents?.notConfirmedAndAbsent ?? 0} también ausentes`}
            onClick={() => go("not_confirmed")}
            aria-label="Ver asignaciones sin confirmar"
          />
          <MetricCard
            title="Fichaje incompleto"
            loading={isLoading}
            value={incidents?.operationsWithIncompletePunches ?? 0}
            description={`${incidents?.incompleteWorkdays ?? 0} jornadas · sin llegada ${incidents?.missingCheckIn ?? 0} · sin salida ${incidents?.missingCheckOut ?? 0} · sin fichaje ${incidents?.noPunch ?? 0}`}
            onClick={() => go("incomplete_punches")}
            aria-label="Ver fichajes incompletos"
          />
        </SimpleGrid>

        <Text size="xs" c="dimmed">
          Distinto de &quot;cobertura de plantilla&quot; (presentismo consolidado). Aquí solo se
          cuentan reemplazos explícitos (ausencia con ASSIGN_REPLACEMENT o cobertura manual marcada).
        </Text>
      </Stack>
    </Paper>
  );
}
