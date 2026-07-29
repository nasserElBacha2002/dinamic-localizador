import { Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { SERVICE_FORM_ID, ServiceForm } from "../../components/services/ServiceForm";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import { UnsavedChangesDialog } from "../../components/navigation/UnsavedChangesDialog";
import {
  DetailFieldGrid,
  EntityAvatar,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useUnsavedChangesController } from "../../hooks/useUnsavedChangesController";
import { useService, useUpdateService } from "../../hooks/useServices";
import type { ServiceFormValues } from "../../schemas/service.schema";
import { toNullableServiceFormat, toNullableServiceText } from "../../schemas/service.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath, isEntityEditPath } from "../../utils/entity-routes";
import { activeStatusLabel } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import { safeText } from "../../utils/display-safe";

export function ServiceEditPage() {
  const { goBackToList } = useListBackNavigation("/services");
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const onEditRoute = isEntityEditPath(location.pathname, "services");
  const unsaved = useUnsavedChangesController({ active: onEditRoute });
  const permissionsQuery = useCompanyPermissions();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "services:manage");
  const serviceQuery = useService(id);
  const updateMutation = useUpdateService(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const goToDetail = () => {
    navigate(getEntityDetailPath("services", id), { state: location.state });
  };

  const handleCancel = () => {
    unsaved.requestNavigation(() => {
      if (onEditRoute) {
        goToDetail();
        return;
      }
      goBackToList();
    });
  };

  const handleSubmit = async (values: ServiceFormValues) => {
    setErrorMessage(null);
    unsaved.setSubmitting(true);

    try {
      await updateMutation.mutateAsync({
        name: values.name,
        address: toNullableServiceText(values.address),
        neighborhood: toNullableServiceText(values.neighborhood),
        locality: toNullableServiceText(values.locality),
        serviceFormat: toNullableServiceFormat(values.serviceFormat),
        latitude: values.latitude,
        longitude: values.longitude,
        allowedRadiusMeters: values.allowedRadiusMeters,
        googlePlaceId: values.googlePlaceId?.trim() ? values.googlePlaceId.trim() : null,
        active: values.active,
      });
      unsaved.markClean();
      notifications.show({
        color: "green",
        message: `${terminology.service.singular} actualizada correctamente.`,
      });
      if (onEditRoute) {
        goToDetail();
        return;
      }
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      unsaved.setSubmitting(false);
    }
  };

  // Until ServiceDetailPage exists, read-only users get a safe consultation view (no map/inputs).
  if (!canManage) {
    return (
      <Stack gap="md">
        <PageHeader
          title={
            <Group gap="md" wrap="nowrap" align="center">
              <EntityAvatar name={service.name} entityType="service" size="lg" />
              <span>{service.name}</span>
            </Group>
          }
          description={`Consulta de ${terminology.service.singular.toLowerCase()}`}
          action={
            <Button variant="default" onClick={goBackToList}>
              Volver al listado
            </Button>
          }
        />
        <SectionCard title="Información general">
          <DetailFieldGrid
            fields={[
              { label: "Nombre", value: service.name },
              { label: "Dirección", value: safeText(service.address), span: { base: 12, sm: 6, lg: 8 } },
              { label: "Barrio", value: safeText(service.neighborhood) },
              { label: "Localidad", value: safeText(service.locality) },
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
              {
                label: "Coordenadas",
                value: `${service.latitude}, ${service.longitude}`,
                span: { base: 12, sm: 6, lg: 4 },
              },
              {
                label: "Radio permitido",
                value: `${service.allowedRadiusMeters} m`,
              },
              {
                label: "Google Place ID",
                value: safeText(service.googlePlaceId),
                span: { base: 12, sm: 12, lg: 8 },
              },
            ]}
          />
        </SectionCard>
        <SectionCard title="Ubicación">
          <Text size="sm" c="dimmed">
            El mapa interactivo está disponible solo para usuarios con permiso de gestión.
          </Text>
        </SectionCard>
      </Stack>
    );
  }

  return (
    <EntityEditPageLayout
      title={
        <Group gap="md" wrap="nowrap" align="center">
          <EntityAvatar name={service.name} entityType="service" size="lg" />
          <span>{service.name}</span>
        </Group>
      }
      description={`Editar ${terminology.service.singular.toLowerCase()}. Actualizá la información y el perímetro de validación de la ubicación.`}
      action={
        <Group gap="sm" visibleFrom="lg">
          <Button variant="default" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" form={SERVICE_FORM_ID} loading={updateMutation.isPending}>
            Guardar cambios
          </Button>
        </Group>
      }
    >
      <ServiceForm
        defaultValues={{
          name: service.name,
          address: service.address ?? "",
          neighborhood: service.neighborhood ?? "",
          locality: service.locality ?? "",
          serviceFormat: service.serviceFormat ?? "",
          latitude: service.latitude,
          longitude: service.longitude,
          allowedRadiusMeters: service.allowedRadiusMeters,
          googlePlaceId: service.googlePlaceId ?? "",
          active: service.active,
        }}
        submitLabel="Guardar cambios"
        cancelTo="/services"
        onCancel={handleCancel}
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        isEditMode
        onDirtyChange={onEditRoute ? unsaved.setDirty : undefined}
        onSubmit={handleSubmit}
      />
      <UnsavedChangesDialog
        open={unsaved.discardDialogOpen}
        onConfirm={unsaved.confirmDiscard}
        onCancel={unsaved.cancelDiscard}
      />
    </EntityEditPageLayout>
  );
}
