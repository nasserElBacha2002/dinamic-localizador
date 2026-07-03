import { Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { STORE_FORM_ID, StoreForm } from "../../components/stores/StoreForm";
import { ErrorState, LoadingState, PageHeader } from "../../design-system";
import { useStore, useUpdateStore } from "../../hooks/useStores";
import type { StoreFormValues } from "../../schemas/store.schema";
import { toNullableStoreFormat, toNullableStoreText } from "../../schemas/store.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function StoreEditPage() {
  const { goBackToList } = useListBackNavigation("/stores");
  const { id } = useParams<{ id: string }>();
  const storeQuery = useStore(id);
  const updateMutation = useUpdateStore(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!id) {
    return <ErrorState message={`${terminology.location.singular} no encontrada.`} />;
  }

  if (storeQuery.isLoading) {
    return <LoadingState />;
  }

  if (storeQuery.isError || !storeQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          storeQuery.error,
          `${terminology.location.singular} no encontrada.`,
        )}
      />
    );
  }

  const store = storeQuery.data;

  const handleSubmit = async (values: StoreFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync({
        name: values.name,
        address: toNullableStoreText(values.address),
        neighborhood: toNullableStoreText(values.neighborhood),
        locality: toNullableStoreText(values.locality),
        storeFormat: toNullableStoreFormat(values.storeFormat),
        latitude: values.latitude,
        longitude: values.longitude,
        allowedRadiusMeters: values.allowedRadiusMeters,
        googlePlaceId: values.googlePlaceId?.trim() ? values.googlePlaceId.trim() : null,
        active: values.active,
      });
      notifications.show({
        color: "green",
        message: `${terminology.location.singular} actualizada correctamente.`,
      });
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Editar ${terminology.location.singular.toLowerCase()}`}
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
      <StoreForm
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
        cancelTo="/stores"
        onCancel={goBackToList}
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        isEditMode
        onSubmit={handleSubmit}
      />
    </>
  );
}
