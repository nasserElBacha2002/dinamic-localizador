import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { useApiHealth, useDatabaseHealth } from "../hooks/useHealth";
import { useInventories } from "../hooks/useInventories";
import type { InventoryWithStore } from "../types/inventory";
import { terminology } from "../domain/terminology";
import { hasAnyPermission } from "../utils/permissions";
import { formatDateTime } from "../utils/dates";
import { inventoryStatusLabels } from "../utils/labels";

type HealthStatus = "loading" | "ok" | "error";

function healthStatusLabel(status: HealthStatus): string {
  if (status === "loading") {
    return "Consultando";
  }

  if (status === "ok") {
    return "Operativo";
  }

  return "Con error";
}

function healthStatusTone(status: HealthStatus): "success" | "warning" | "danger" {
  if (status === "ok") {
    return "success";
  }

  if (status === "loading") {
    return "warning";
  }

  return "danger";
}

interface HealthMetricCardProps {
  title: string;
  status: HealthStatus;
  details: string;
}

function HealthMetricCard({ title, status, details }: HealthMetricCardProps) {
  return (
    <MetricCard
      title={title}
      value={<StatusBadge label={healthStatusLabel(status)} tone={healthStatusTone(status)} />}
      description={details}
      loading={status === "loading"}
    />
  );
}

function UpcomingInventoryCard({ inventory }: { inventory: InventoryWithStore }) {
  const navigate = useNavigate();
  const destination = `/inventories/${inventory.id}`;
  const ariaLabel = `Ver ${terminology.operation.singular.toLowerCase()} de ${inventory.store.name}`;

  const handleNavigate = () => {
    navigate(destination);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  const scheduleText = inventory.scheduledEnd
    ? `${formatDateTime(inventory.scheduledStart)} – ${formatDateTime(inventory.scheduledEnd)}`
    : formatDateTime(inventory.scheduledStart);

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
        <Text fw={600}>{inventory.store.name}</Text>
        <Text size="sm" c="dimmed">
          {inventory.store.address ?? "—"} · {scheduleText}
        </Text>
        <StatusBadge
          label={inventoryStatusLabels[inventory.status] ?? inventory.status}
          tone="info"
          variant="light"
        />
      </Stack>
    </Card>
  );
}

export function HomePage() {
  const apiHealth = useApiHealth();
  const databaseHealth = useDatabaseHealth();
  const permissionsQuery = useCompanyPermissions();
  const healthReady = databaseHealth.data?.database === "connected";

  const canReadInventories = hasAnyPermission(permissionsQuery.data?.permissions, [
    "inventories:read",
    "inventories:manage",
  ]);

  const upcomingInventoriesQuery = useInventories(
    { status: "SCHEDULED", page: 1, limit: 5 },
    healthReady && canReadInventories,
  );

  const apiStatus: HealthStatus = apiHealth.isLoading
    ? "loading"
    : apiHealth.isError
      ? "error"
      : "ok";

  const databaseStatus: HealthStatus = databaseHealth.isLoading
    ? "loading"
    : databaseHealth.data?.database === "connected"
      ? "ok"
      : "error";

  const upcomingSummaryStatus: HealthStatus = upcomingInventoriesQuery.isLoading
    ? "loading"
    : upcomingInventoriesQuery.isError
      ? "error"
      : "ok";

  return (
    <>
      <PageHeader
        title="Dinamic Attendance"
        description={`Panel administrativo para planificar ${terminology.operation.plural.toLowerCase()}, asignar ${terminology.worker.plural.toLowerCase()} y revisar asistencias.`}
      />

      <SimpleGrid cols={{ base: 1, md: 2, lg: canReadInventories ? 3 : 2 }} spacing="md" mb="xl">
        <HealthMetricCard
          title="Backend"
          status={apiStatus}
          details={
            apiHealth.data
              ? `Servicio ${apiHealth.data.service} operativo`
              : apiHealth.isError
                ? "No se pudo contactar al backend"
                : "Verificando..."
          }
        />
        <HealthMetricCard
          title="Base de datos"
          status={databaseStatus}
          details={
            databaseHealth.data?.database === "connected"
              ? "Conexión establecida"
              : databaseHealth.data?.message ?? "Verificando conexión..."
          }
        />
        {canReadInventories ? (
          <HealthMetricCard
            title={`Próximas ${terminology.operation.plural.toLowerCase()}`}
            status={upcomingSummaryStatus}
            details={
              upcomingInventoriesQuery.data
                ? `${upcomingInventoriesQuery.data.meta.total} ${terminology.operation.plural.toLowerCase()} programadas`
                : "No disponible"
            }
          />
        ) : null}
      </SimpleGrid>

      {canReadInventories ? (
        <SectionCard
          title={`Próximas ${terminology.operation.plural.toLowerCase()}`}
          description={`${terminology.operation.plural} programadas a continuación.`}
        >
          {upcomingInventoriesQuery.isLoading ? <LoadingState height={160} /> : null}
          {upcomingInventoriesQuery.isError ? (
            <ErrorState
              message={`No se pudieron cargar las ${terminology.operation.plural.toLowerCase()} programadas.`}
            />
          ) : null}
          {!upcomingInventoriesQuery.isLoading &&
          !upcomingInventoriesQuery.isError &&
          upcomingInventoriesQuery.data?.data.length === 0 ? (
            <EmptyState
              title={`No hay ${terminology.operation.plural.toLowerCase()} programadas`}
              description={`Cuando programes ${terminology.operation.plural.toLowerCase()}, aparecerán aquí.`}
            />
          ) : null}
          {upcomingInventoriesQuery.data && upcomingInventoriesQuery.data.data.length > 0 ? (
            <Stack gap="sm">
              {upcomingInventoriesQuery.data.data.map((inventory) => (
                <UpcomingInventoryCard key={inventory.id} inventory={inventory} />
              ))}
            </Stack>
          ) : null}
        </SectionCard>
      ) : (
        <SectionCard title="Estado operativo" description="Resumen del entorno de la plataforma.">
          <Text size="sm" c="dimmed">
            Conectá la base de datos y revisá el estado del backend para habilitar más información
            operativa en el panel.
          </Text>
        </SectionCard>
      )}
    </>
  );
}
