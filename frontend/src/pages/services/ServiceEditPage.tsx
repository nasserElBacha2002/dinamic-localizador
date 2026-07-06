import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { STORE_FORM_ID, ServiceForm } from "../../components/services/ServiceForm";
import { ErrorState, LoadingState, PageHeader } from "../../design-system";
import { useService, useUpdateService } from "../../hooks/useServices";
import type { ServiceFormValues } from "../../schemas/service.schema";
import { toNullableServiceFormat, toNullableServiceText } from "../../schemas/service.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function ServiceEditPage() {
  const { goBackToList } = useListBackNavigation("/services");
  const { id } = useParams<{ id: string }>();
  const storeQuery = useService(id);
  const updateMutation = useUpdateService(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!id) {
    return <ErrorState message={`${terminology.service.singular} no encontrada.`} />;
  }

  if (storeQuery.isLoading) {
    return <LoadingState />;
  }

  if (storeQuery.isError || !storeQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          storeQuery.error,
          `${terminology.service.singular} no encontrada.`,
        )}
      />
    );
  }

  const store = storeQuery.data;

  const handleSubmit = async (values: ServiceFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync({
        name: values.name,
        address: toNullableServiceText(values.address),
        neighborhood: toNullableServiceText(values.neighborhood),
        locality: toNullableServiceText(values.locality),
        storeFormat: toNullableServiceFormat(values.storeFormat),
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
            <Button type="submit" form={STORE_FORM_ID} loading={updateMutation.isPending}>
              Guardar cambios
            </Button>
          </Group>
        }
      />
      <ServiceForm
        defaultValues={{
          name: store.name,
          address: store.address ?? "",
          neighborhood: store.neighborhood ?? "",
          locality: store.locality ?? "",
          storeFormat: store.storeFormat ?? "",
          latitude: store.latitude,
          longitude: store.longitude,
          allowedRadiusMeters: store.allowedRadiusMeters,
          googlePlaceId: store.googlePlaceId ?? "",
          active: store.active,
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
