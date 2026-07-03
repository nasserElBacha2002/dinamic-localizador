import { Button, Group } from "@mantine/core";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STORE_FORM_ID, StoreForm } from "../../components/stores/StoreForm";
import { PageHeader } from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateStore } from "../../hooks/useStores";
import type { StoreFormValues } from "../../schemas/store.schema";
import { toNullableStoreFormat, toNullableStoreText } from "../../schemas/store.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function StoreCreatePage() {
  const { goBackToList } = useListBackNavigation("/stores");
  const [searchParams] = useSearchParams();
  const createMutation = useCreateStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const defaultName = useMemo(() => searchParams.get("name")?.trim() ?? "", [searchParams]);
  const submitLabel = `Crear ${terminology.location.singular.toLowerCase()}`;

  const handleSubmit = async (values: StoreFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync({
        name: values.name,
        address: toNullableStoreText(values.address),
        neighborhood: toNullableStoreText(values.neighborhood),
        locality: toNullableStoreText(values.locality),
        storeFormat: toNullableStoreFormat(values.storeFormat),
        latitude: values.latitude,
        longitude: values.longitude,
        allowedRadiusMeters: values.allowedRadiusMeters,
        googlePlaceId: values.googlePlaceId?.trim() ? values.googlePlaceId.trim() : null,
      });
      goBackToList();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Nueva ${terminology.location.singular.toLowerCase()}`}
        description="Definí la ubicación y el perímetro de validación."
        action={
          <Group gap="sm" visibleFrom="lg">
            <Button variant="default" onClick={goBackToList}>
              Cancelar
            </Button>
            <Button type="submit" form={STORE_FORM_ID} loading={createMutation.isPending}>
              {submitLabel}
            </Button>
          </Group>
        }
      />
      <StoreForm
        defaultValues={{
          name: defaultName,
          address: "",
          neighborhood: "",
          locality: "",
          storeFormat: "",
          latitude: -34.6037,
          longitude: -58.3816,
          allowedRadiusMeters: 150,
          googlePlaceId: "",
          active: true,
        }}
        submitLabel={submitLabel}
        cancelTo="/stores"
        onCancel={goBackToList}
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        isEditMode={false}
        onSubmit={handleSubmit}
      />
    </>
  );
}
