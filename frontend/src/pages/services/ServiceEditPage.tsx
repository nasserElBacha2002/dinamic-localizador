import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { SERVICE_FORM_ID, ServiceForm } from "../../components/services/ServiceForm";
import { ErrorState, LoadingState, PageHeader } from "../../design-system";
import { useService, useUpdateService } from "../../hooks/useServices";
import type { ServiceFormValues } from "../../schemas/service.schema";
import { toNullableServiceFormat, toNullableServiceText } from "../../schemas/service.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function ServiceEditPage() {
  const { goBackToList } = useListBackNavigation("/services");
  const { id } = useParams<{ id: string }>();
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

  const handleSubmit = async (values: ServiceFormValues) => {
    setErrorMessage(null);

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
      notifications.show({
        color: "green",
        message: `${terminology.service.singular} actualizada correctamente.`,
      });
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Editar ${terminology.service.singular.toLowerCase()}`}
        description="Actualizá la información y el perímetro de validación de la ubicación."
        action={
          <Group gap="sm" visibleFrom="lg">
            <Button variant="default" onClick={goBackToList}>
              Cancelar
            </Button>
            <Button type="submit" form={SERVICE_FORM_ID} loading={updateMutation.isPending}>
              Guardar cambios
            </Button>
          </Group>
        }
      />
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
        onCancel={goBackToList}
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        isEditMode
        onSubmit={handleSubmit}
      />
    </>
  );
}
