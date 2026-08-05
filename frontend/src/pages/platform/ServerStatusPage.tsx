import { SimpleGrid, Stack, Text } from "@mantine/core";
import {
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePlatformServerStatus } from "../../hooks/usePlatformServerStatus";
import type {
  PlatformGcsStatus,
  PlatformOverallStatus,
  PlatformServerStatus,
} from "../../types/platform-server-status";
import { getApiErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/dates";

type UiTone = "success" | "warning" | "danger" | "neutral";

function overallTone(status: PlatformOverallStatus): UiTone {
  if (status === "ok") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function overallLabel(status: PlatformOverallStatus): string {
  if (status === "ok") return "Operativo";
  if (status === "degraded") return "Degradado";
  return "Con error";
}

function gcsLabel(status: PlatformGcsStatus): string {
  if (status === "ok") return "Operativo";
  if (status === "degraded") return "Degradado";
  if (status === "disabled") return "No configurado";
  return "Con error";
}

function componentLabel(status: "ok" | "error"): string {
  return status === "ok" ? "Operativo" : "Con error";
}

function HealthMetricCard({
  title,
  label,
  details,
}: {
  title: string;
  label: string;
  details: string;
}) {
  return <MetricCard title={title} value={label} description={details} />;
}

function SnapshotView({ data }: { data: PlatformServerStatus }) {
  return (
    <Stack gap="md">
      <SectionCard
        title="Resumen"
        description={`Última actualización: ${formatDateTime(data.timestamp)}`}
      >
        <StatusBadge label={overallLabel(data.status)} tone={overallTone(data.status)} />
      </SectionCard>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <HealthMetricCard
          title="Backend"
          label={componentLabel(data.backend.status)}
          details={`Servicio ${data.backend.service}`}
        />
        <HealthMetricCard
          title="Base de datos"
          label={componentLabel(data.database.status)}
          details={
            data.database.status === "ok"
              ? "Conexión establecida"
              : (data.database.message ?? "Sin conexión")
          }
        />
        <HealthMetricCard
          title="Almacenamiento (GCS)"
          label={gcsLabel(data.gcs.status)}
          details={
            data.gcs.status === "ok"
              ? "Disponible"
              : data.gcs.status === "disabled"
                ? "No configurado en este entorno"
                : (data.gcs.message ?? "No disponible")
          }
        />
      </SimpleGrid>

      <SectionCard title="Alcance" description="Acceso exclusivo de superadministrador.">
        <Text size="sm" c="dimmed">
          Esta vista usa el rol global de plataforma. Cambiar la empresa activa no modifica el
          acceso.
        </Text>
      </SectionCard>
    </Stack>
  );
}

export function ServerStatusPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const statusQuery = usePlatformServerStatus(isPlatformAdmin);

  if (authLoading) {
    return <LoadingState message="Cargando acceso..." />;
  }

  if (!isPlatformAdmin) {
    return (
      <ErrorState message="Solo un superadministrador de plataforma puede ver el estado de servidores." />
    );
  }

  return (
    <>
      <PageHeader
        title="Estado de servidores"
        description="Monitoreo de la API, la base de datos y el almacenamiento de la plataforma."
      />

      {statusQuery.isPending ? <LoadingState message="Consultando estado de servidores..." /> : null}

      {statusQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(
            statusQuery.error,
            "No se pudo obtener el estado de los servidores.",
          )}
        />
      ) : null}

      {!statusQuery.isPending && !statusQuery.isError && statusQuery.data ? (
        <SnapshotView data={statusQuery.data} />
      ) : null}
    </>
  );
}
