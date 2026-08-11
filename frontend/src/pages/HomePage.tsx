import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { EntityLink } from "../components/entity-link";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../design-system";
import { useCompanyPermissions } from "../hooks/useCompanyUsers";
import { useOperations } from "../hooks/useOperations";
import type { OperationWithService } from "../types/operation";
import { terminology } from "../domain/terminology";
import { hasAnyPermission } from "../utils/permissions";
import { formatDateTime } from "../utils/dates";
import { operationStatusLabels } from "../utils/labels";

type SummaryStatus = "loading" | "ok" | "error";

function summaryStatusLabel(status: SummaryStatus): string {
  if (status === "loading") {
    return "Consultando";
  }

  if (status === "ok") {
    return "Operativo";
  }

  return "Con error";
}

function summaryStatusTone(status: SummaryStatus): "success" | "warning" | "danger" {
  if (status === "ok") {
    return "success";
  }

  if (status === "loading") {
    return "warning";
  }

  return "danger";
}

function UpcomingOperationCard({ operation }: { operation: OperationWithService }) {
  const navigate = useNavigate();
  const destination = `/operations/${operation.id}`;
  const ariaLabel = `Ver ${terminology.operation.singular.toLowerCase()} de ${operation.service.name}`;

  const handleNavigate = () => {
    navigate(destination);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  const scheduleText = operation.scheduledEnd
    ? `${formatDateTime(operation.scheduledStart)} – ${formatDateTime(operation.scheduledEnd)}`
    : formatDateTime(operation.scheduledStart);

  return (
    <Card
      withBorder
      padding="md"
      radius="md"
      role="link"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      style={{ cursor: "pointer" }}
    >
      <Stack gap={4}>
        <Text fw={600}>
          <EntityLink
            entityType="service"
            entityId={operation.serviceId ?? operation.service?.id}
            label={operation.service.name}
            stopPropagation
          />
        </Text>
        <Text size="sm" c="dimmed">
          {operation.service.address ?? "—"} · {scheduleText}
        </Text>
        <StatusBadge
          label={operationStatusLabels[operation.status] ?? operation.status}
          tone="info"
          variant="light"
        />
      </Stack>
    </Card>
  );
}

export function HomePage() {
  const permissionsQuery = useCompanyPermissions();

  const canReadOperations = hasAnyPermission(permissionsQuery.data?.permissions, [
    "operations:read",
    "operations:manage",
  ]);

  const upcomingOperationsQuery = useOperations(
    { status: "SCHEDULED", page: 1, limit: 5 },
    canReadOperations,
  );

  const upcomingSummaryStatus: SummaryStatus = upcomingOperationsQuery.isLoading
    ? "loading"
    : upcomingOperationsQuery.isError
      ? "error"
      : "ok";

  return (
    <>
      <PageHeader
        title="Dinamic Attendance"
        description={`Panel administrativo para planificar ${terminology.operation.plural.toLowerCase()}, asignar ${terminology.worker.plural.toLowerCase()} y revisar asistencias.`}
      />

      {canReadOperations ? (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="xl">
          <MetricCard
            title={`Próximas ${terminology.operation.plural.toLowerCase()}`}
            value={
              <StatusBadge
                label={summaryStatusLabel(upcomingSummaryStatus)}
                tone={summaryStatusTone(upcomingSummaryStatus)}
              />
            }
            description={
              upcomingOperationsQuery.data
                ? `${upcomingOperationsQuery.data.meta.total} ${terminology.operation.plural.toLowerCase()} programadas`
                : "No disponible"
            }
            loading={upcomingSummaryStatus === "loading"}
          />
        </SimpleGrid>
      ) : null}

      {canReadOperations ? (
        <SectionCard
          title={`Próximas ${terminology.operation.plural.toLowerCase()}`}
          description={`${terminology.operation.plural} programadas a continuación.`}
        >
          {upcomingOperationsQuery.isLoading ? <LoadingState height={160} /> : null}
          {upcomingOperationsQuery.isError ? (
            <ErrorState
              message={`No se pudieron cargar las ${terminology.operation.plural.toLowerCase()} programadas.`}
            />
          ) : null}
          {!upcomingOperationsQuery.isLoading &&
          !upcomingOperationsQuery.isError &&
          upcomingOperationsQuery.data?.data.length === 0 ? (
            <EmptyState
              title={`No hay ${terminology.operation.plural.toLowerCase()} programadas`}
              description={`Cuando programes ${terminology.operation.plural.toLowerCase()}, aparecerán aquí.`}
            />
          ) : null}
          {upcomingOperationsQuery.data && upcomingOperationsQuery.data.data.length > 0 ? (
            <Stack gap="sm">
              {upcomingOperationsQuery.data.data.map((operation) => (
                <UpcomingOperationCard key={operation.id} operation={operation} />
              ))}
            </Stack>
          ) : null}
        </SectionCard>
      ) : (
        <SectionCard title="Estado operativo" description="Resumen del entorno de la plataforma.">
          <Text size="sm" c="dimmed">
            Seleccioná una empresa y revisá los módulos habilitados para ver información operativa
            en el panel.
          </Text>
        </SectionCard>
      )}
    </>
  );
}
