import { Button, Group } from "@mantine/core";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STORE_FORM_ID, ServiceForm } from "../../components/services/ServiceForm";
import { PageHeader } from "../../design-system";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { useCreateService } from "../../hooks/useServices";
import type { ServiceFormValues } from "../../schemas/service.schema";
import { toNullableServiceFormat, toNullableServiceText } from "../../schemas/service.schema";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";

export function ServiceCreatePage() {
  const { goBackToList } = useListBackNavigation("/services");
  const [searchParams] = useSearchParams();
  const createMutation = useCreateService();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const defaultName = useMemo(() => searchParams.get("name")?.trim() ?? "", [searchParams]);
  const submitLabel = `Crear ${terminology.service.singular.toLowerCase()}`;

  const handleSubmit = async (values: ServiceFormValues) => {
    setErrorMessage(null);

    try {
      await createMutation.mutateAsync({
        name: values.name,
        address: toNullableServiceText(values.address),
        neighborhood: toNullableServiceText(values.neighborhood),
        locality: toNullableServiceText(values.locality),
        storeFormat: toNullableServiceFormat(values.storeFormat),
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
        title={`Nueva ${terminology.service.singular.toLowerCase()}`}
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
      <ServiceForm
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
        cancelTo="/services"
        onCancel={goBackToList}
        loading={createMutation.isPending}
        errorMessage={errorMessage}
        isEditMode={false}
        onSubmit={handleSubmit}
      />
    </>
  );
}
