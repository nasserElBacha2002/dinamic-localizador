import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StoreForm } from "../../components/stores/StoreForm";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { useStore, useUpdateStore } from "../../hooks/useStores";
import { AdminLayout } from "../../layouts/AdminLayout";
import type { StoreFormValues } from "../../schemas/store.schema";
import { getApiErrorMessage } from "../../utils/errors";

export function StoreEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const storeQuery = useStore(id);
  const updateMutation = useUpdateStore(id ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  if (!id) {
    return (
      <AdminLayout>
        <ErrorState message="Tienda no encontrada." />
      </AdminLayout>
    );
  }

  if (storeQuery.isLoading) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (storeQuery.isError || !storeQuery.data) {
    return (
      <AdminLayout>
        <ErrorState message={getApiErrorMessage(storeQuery.error, "Tienda no encontrada.")} />
      </AdminLayout>
    );
  }

  const store = storeQuery.data;

  const handleSubmit = async (values: StoreFormValues) => {
    setErrorMessage(null);

    try {
      await updateMutation.mutateAsync({
        name: values.name,
        address: values.address?.trim() ? values.address.trim() : null,
        latitude: values.latitude,
        longitude: values.longitude,
        allowedRadiusMeters: values.allowedRadiusMeters,
        googlePlaceId: values.googlePlaceId?.trim() ? values.googlePlaceId.trim() : null,
        active: values.active,
      });
      setSuccessOpen(true);
      navigate("/stores");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  };

  return (
    <AdminLayout>
      <PageHeader title="Editar tienda" description={store.name} />
      <StoreForm
        defaultValues={{
          name: store.name,
          address: store.address ?? "",
          latitude: store.latitude,
          longitude: store.longitude,
          allowedRadiusMeters: store.allowedRadiusMeters,
          googlePlaceId: store.googlePlaceId ?? "",
          active: store.active,
        }}
        submitLabel="Guardar cambios"
        cancelTo="/stores"
        loading={updateMutation.isPending}
        errorMessage={errorMessage}
        isEditMode
        onSubmit={handleSubmit}
      />
      <FeedbackSnackbar
        open={successOpen}
        message="Tienda actualizada correctamente."
        onClose={() => setSuccessOpen(false)}
      />
    </AdminLayout>
  );
}
