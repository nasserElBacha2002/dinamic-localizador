import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { SERVICE_FORM_ID, ServiceForm } from "../../components/services/ServiceForm";
import { EntityEditPageLayout } from "../../components/navigation/EntityEditPageLayout";
import { UnsavedChangesDialog } from "../../components/navigation/UnsavedChangesDialog";
import { EntityAvatar, ErrorState, LoadingState } from "../../design-system";
import { useUnsavedChangesController } from "../../hooks/useUnsavedChangesController";
import { useService, useUpdateService } from "../../hooks/useServices";
import type { ServiceFormValues } from "../../schemas/service.schema";
import { toNullableServiceFormat, toNullableServiceText } from "../../schemas/service.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import { getEntityDetailPath } from "../../utils/entity-routes";

export function ServiceEditPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const unsaved = useUnsavedChangesController({ active: true });
  const serviceQuery = useService(id);
  const updateMutation = useUpdateService(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!id) {
    return <ErrorState message={`${terminology.service.singular} no encontrada.`} />;
  }

  if (serviceQuery.isLoading) {
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
    unsaved.requestNavigation(goToDetail);
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
      goToDetail();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      unsaved.setSubmitting(false);
    }
  };

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
        cancelTo={getEntityDetailPath("services", id)}
        onCancel={handleCancel}
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        isEditMode
        onDirtyChange={unsaved.setDirty}
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
