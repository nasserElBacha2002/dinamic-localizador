import { Button, Stack } from "@mantine/core";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import { EntityEditAction } from "../../components/navigation/EntityEditAction";
import { ServiceLocationMapView } from "../../components/services/location-picker/components/ServiceLocationMapView";
import {
  ActionMenu,
  DetailFieldGrid,
  EntityPageTitle,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
  type ActionMenuItem,
} from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useService } from "../../hooks/useServices";
import { terminology } from "../../domain/terminology";
import { safeText } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityEditPath } from "../../utils/entity-routes";
import { activeStatusLabel } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";

export function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBackToList } = useListBackNavigation("/services");
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "services:manage");
  const canCreateOperation = hasPermission(
    permissionsQuery.data?.permissions,
    "operations:manage",
  );
  const serviceQuery = useService(id);

  if (!id) {
    return <ErrorState message={`${terminology.service.singular} no encontrada.`} />;
  }

  if (serviceQuery.isLoading || permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (serviceQuery.isError || !serviceQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          serviceQuery.error,
          `${terminology.service.singular} no encontrada.`,
        )}
      />
    );
  }

  const service = serviceQuery.data;
  const showCreateOperation = Boolean(canCreateOperation && service.active);

  const secondaryItems: ActionMenuItem[] = [];
  if (showCreateOperation && canManage) {
    secondaryItems.push({
      key: "edit",
      label: "Editar",
      onClick: () => navigate(getEntityEditPath("services", service.id)),
    });
  }
  if (showCreateOperation || canManage) {
    secondaryItems.push({
      key: "back",
      label: "Volver al listado",
      onClick: goBackToList,
    });
  }

  const primaryAction = showCreateOperation ? (
    <Button
      component={RouterLink}
      to={`/operations/new?serviceId=${encodeURIComponent(service.id)}`}
    >
      {`Crear ${terminology.operation.singular.toLowerCase()}`}
    </Button>
  ) : canManage ? (
    <EntityEditAction entity="services" id={service.id} />
  ) : (
    <Button variant="default" onClick={goBackToList}>
      Volver al listado
    </Button>
  );

  return (
    <Stack gap="md">
      <PageHeader
        title={<EntityPageTitle name={service.name} entityType="service" />}
        description={`Unidad operativa · ubicación y perímetro de validación`}
        action={
          <ActionMenu
            primary={primaryAction}
            items={secondaryItems}
            menuLabel={`Más acciones del ${terminology.service.singular.toLowerCase()}`}
          />
        }
      />

      <SectionCard
        title="Identidad operativa"
        description="Nombre, formato y estado del servicio."
      >
        <DetailFieldGrid
          fields={[
            { label: "Nombre", value: service.name },
            { label: "Formato", value: safeText(service.serviceFormat) },
            {
              label: "Estado",
              value: (
                <StatusBadge
                  label={activeStatusLabel(service.active)}
                  tone={service.active ? "success" : "neutral"}
                />
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Ubicación" description="Dirección y referencia territorial.">
        <DetailFieldGrid
          fields={[
            {
              label: "Dirección",
              value: safeText(service.address),
              span: { base: 12, sm: 8 },
            },
            { label: "Barrio", value: safeText(service.neighborhood) },
            { label: "Localidad", value: safeText(service.locality) },
            {
              label: "Coordenadas",
              value: `${service.latitude}, ${service.longitude}`,
              span: { base: 12, sm: 6 },
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Perímetro de validación"
        description="Geocerca y radio usados para validar asistencia."
      >
        <DetailFieldGrid
          fields={[
            {
              label: "Radio permitido",
              value: `${service.allowedRadiusMeters} m`,
            },
          ]}
        />
        <ServiceLocationMapView
          latitude={service.latitude}
          longitude={service.longitude}
          allowedRadiusMeters={service.allowedRadiusMeters}
        />
      </SectionCard>
    </Stack>
  );
}
