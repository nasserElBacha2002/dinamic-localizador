import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StoreForm } from "../../components/stores/StoreForm";
import { PageHeader } from "../../design-system";
import { useCreateStore } from "../../hooks/useStores";
import type { StoreFormValues } from "../../schemas/store.schema";
import { toNullableStoreFormat, toNullableStoreText } from "../../schemas/store.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function StoreCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createMutation = useCreateStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const defaultName = useMemo(() => searchParams.get("name")?.trim() ?? "", [searchParams]);

  const handleSubmit = async (values: StoreFormValues) => {
    setErrorMessage(null);

    try {
      const store = await createMutation.mutateAsync({
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
      navigate(`/stores/${store.id}`);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={`Nueva ${terminology.location.singular.toLowerCase()}`}
        description="Definí la ubicación y el radio permitido."
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
        submitLabel={`Crear ${terminology.location.singular.toLowerCase()}`}
        cancelTo="/stores"
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        isEditMode={false}
        onSubmit={handleSubmit}
      />
    </>
  );
}
